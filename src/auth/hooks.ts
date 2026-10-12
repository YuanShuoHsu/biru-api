// https://better-auth.com/docs/concepts/hooks

import { Logger } from '@nestjs/common';

import {
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { diffAuditRows, type AuditRow } from '../common/utils/audit-diff';
import { resolveChangeLabels } from '../common/utils/audit-resources';
import { db } from '../db';
import * as schema from '../db/schema';
import { forgetDeletedUser } from '../deleted-records/forget-user';
import {
  latestDeletedRecordId,
  mergePreDeletedChildren,
  type DeletionParent,
} from '../deleted-records/request-batch';
import {
  assertOrganizationOpen,
  ORGANIZATION_WRITE_PATHS,
} from './closure-guards';
import { assertUserDeletable } from './deletion-guards';

import type {
  AuditAction,
  AuditChanges,
  AuditResource,
} from '../db/schema/audit';

const logger = new Logger('AuthAudit');

type AuditedTable =
  | typeof schema.invitation
  | typeof schema.member
  | typeof schema.organization
  | typeof schema.team
  | typeof schema.user;

const TABLES = {
  invitation: schema.invitation,
  member: schema.member,
  organization: schema.organization,
  team: schema.team,
  user: schema.user,
} satisfies Partial<Record<AuditResource, AuditedTable>>;

type AuditedResource = keyof typeof TABLES;

// 成員角色與平台角色、邀請狀態與其他狀態的值會撞名（admin、pending），換成專屬欄位名讓前端各自翻譯
const RENAMED_FIELDS: Partial<Record<AuditedResource, Record<string, string>>> =
  {
    invitation: { role: 'memberRole', status: 'invitationStatus' },
    member: { role: 'memberRole' },
  };

type Target = { resource: AuditedResource; id: string };

type Event = {
  target: Target;
  before?: AuditRow;
  changes?: AuditChanges;
};

type Body = Record<string, unknown>;

const asString = (value: unknown) =>
  typeof value === 'string' ? value : undefined;

const asRow = (value: unknown): AuditRow | undefined =>
  typeof value === 'object' && value !== null ? (value as AuditRow) : undefined;

const toTarget =
  (resource: AuditedResource) =>
  (id: unknown): Target | undefined => {
    const value = asString(id);

    return value ? { resource, id: value } : undefined;
  };

const userTarget = toTarget('user');
const invitationTarget = toTarget('invitation');

const BEFORE_TARGETS: Record<string, (body: Body) => Target | undefined> = {
  '/admin/ban-user': ({ userId }) => userTarget(userId),
  '/admin/remove-user': ({ userId }) => userTarget(userId),
  '/admin/set-role': ({ userId }) => userTarget(userId),
  '/admin/unban-user': ({ userId }) => userTarget(userId),
  '/admin/update-user': ({ userId }) => userTarget(userId),
  '/organization/accept-invitation': ({ invitationId }) =>
    invitationTarget(invitationId),
  '/organization/cancel-invitation': ({ invitationId }) =>
    invitationTarget(invitationId),
  '/organization/delete': ({ organizationId }) =>
    toTarget('organization')(organizationId),
  '/organization/reject-invitation': ({ invitationId }) =>
    invitationTarget(invitationId),
  '/organization/remove-team': ({ teamId }) => toTarget('team')(teamId),
  '/organization/update-member-role': ({ memberId }) =>
    toTarget('member')(memberId),
  '/organization/update-team': ({ teamId }) => toTarget('team')(teamId),
};

const findRow = async ({ resource, id }: Target) => {
  const table = TABLES[resource];
  const [row]: AuditRow[] = await db
    .select()
    .from(table)
    .where(eq(table.id, id));

  return row;
};

const snapshots = new WeakMap<Request, AuditRow | undefined>();

const toEvents = (
  path: string,
  body: Body,
  returned: AuditRow,
  before: AuditRow | undefined,
): Event[] => {
  const beforeTarget = BEFORE_TARGETS[path]?.(body);
  if (beforeTarget) {
    const events: Event[] = [{ target: beforeTarget, before }];

    if (path === '/organization/accept-invitation') {
      const accepted = asRow(returned.member);
      const id = asString(accepted?.id);
      if (id) events.push({ target: { resource: 'member', id } });
    }

    return events;
  }

  switch (path) {
    case '/admin/create-user': {
      const id = asString(asRow(returned.user)?.id);

      return id ? [{ target: { resource: 'user', id } }] : [];
    }
    case '/admin/impersonate-user': {
      const session = asRow(returned.session);
      const id = asString(session?.userId);

      return id
        ? [
            {
              target: { resource: 'user', id },
              changes: {
                impersonatedBy: {
                  before: null,
                  after: session?.impersonatedBy ?? null,
                },
              },
            },
          ]
        : [];
    }
    case '/admin/set-user-password': {
      const id = asString(body.userId);

      return id
        ? [
            {
              target: { resource: 'user', id },
              changes: { passwordReset: { before: false, after: true } },
            },
          ]
        : [];
    }
    case '/admin/revoke-user-session':
    case '/admin/revoke-user-sessions': {
      const id = asString(before?.userId);
      const count = before?.count;

      return id && typeof count === 'number' && count > 0
        ? [
            {
              target: { resource: 'user', id },
              changes: { revokedSessions: { before: null, after: count } },
            },
          ]
        : [];
    }
    case '/organization/add-team-member': {
      const id = asString(returned.teamId);

      return id
        ? [
            {
              target: { resource: 'team', id },
              changes: {
                member: { before: null, after: returned.userId ?? null },
              },
            },
          ]
        : [];
    }
    case '/organization/create-team': {
      const id = asString(returned.id);

      return id ? [{ target: { resource: 'team', id } }] : [];
    }
    case '/organization/remove-team-member': {
      const id = asString(body.teamId);

      return id
        ? [
            {
              target: { resource: 'team', id },
              changes: { member: { before: body.userId ?? null, after: null } },
            },
          ]
        : [];
    }
    case '/organization/create': {
      const id = asString(returned.id);

      return id ? [{ target: { resource: 'organization', id } }] : [];
    }
    case '/organization/invite-member': {
      const id = asString(returned.id);

      return id ? [{ target: { resource: 'invitation', id } }] : [];
    }
    case '/organization/leave': {
      const id = asString(returned.id);

      return id
        ? [{ target: { resource: 'member', id }, before: returned }]
        : [];
    }
    case '/organization/remove-member': {
      const removed = asRow(returned.member);
      const id = asString(removed?.id);

      return id
        ? [{ target: { resource: 'member', id }, before: removed }]
        : [];
    }
    default:
      return [];
  }
};

const renameFields = (
  resource: AuditedResource,
  changes: AuditChanges,
): AuditChanges => {
  const renamed = RENAMED_FIELDS[resource];
  if (!renamed) return changes;

  return Object.fromEntries(
    Object.entries(changes).map(([field, change]) => [
      renamed[field] ?? field,
      change,
    ]),
  );
};

const getLabel = async (resource: AuditedResource, row: AuditRow) => {
  switch (resource) {
    case 'invitation':
      return asString(row.email) ?? null;
    case 'member': {
      const userId = asString(row.userId);
      if (!userId) return null;

      const [owner] = await db
        .select({ name: schema.user.name })
        .from(schema.user)
        .where(eq(schema.user.id, userId));

      return owner?.name ?? null;
    }
    default:
      return asString(row.name) ?? null;
  }
};

const writeEvent = async (
  actor: { id: string; name: string; email: string },
  { target, before, changes: explicitChanges }: Event,
) => {
  const after = await findRow(target);
  const row = after ?? before;
  if (!row) return;

  const changes = explicitChanges ?? diffAuditRows(before, after);
  if (!Object.keys(changes).length) return;

  const action: AuditAction = explicitChanges
    ? 'update'
    : !before
      ? 'create'
      : !after
        ? 'delete'
        : 'update';

  // 組織刪除後以 organizationId 串接的紀錄會被 cascade 掉，刪除本身要記在平台層
  const organizationId =
    target.resource === 'organization'
      ? action === 'delete'
        ? null
        : target.id
      : target.resource === 'user'
        ? null
        : (asString(row.organizationId) ?? null);

  const [changeLabels] = await resolveChangeLabels(db, [
    { scope: target.resource, changes },
  ]);

  await db.insert(schema.auditLog).values({
    id: uuidv4(),
    actorId: actor.id,
    actorName: actor.name,
    actorEmail: actor.email,
    organizationId,
    resource: target.resource,
    resourceId: target.id,
    resourceLabel: await getLabel(target.resource, row),
    ancestorIds: [],
    action,
    changes: renameFields(target.resource, changes),
    changeLabels,
  });
};

const SELF_DELETE_PATHS = new Set(['/delete-user', '/delete-user/callback']);

const REVOKE_SESSION_PATHS = new Set([
  '/admin/revoke-user-session',
  '/admin/revoke-user-sessions',
]);

const countRevokedSessions = async (
  path: string,
  body: Record<string, unknown>,
): Promise<AuditRow | undefined> => {
  if (path === '/admin/revoke-user-session') {
    const token = asString(body.sessionToken);
    if (!token) return undefined;

    const row = await db.query.session.findFirst({
      where: eq(schema.session.token, token),
      columns: { userId: true },
    });

    return row ? { userId: row.userId, count: 1 } : undefined;
  }

  const userId = asString(body.userId);
  if (!userId) return undefined;

  const rows = await db.query.session.findMany({
    where: eq(schema.session.userId, userId),
    columns: { id: true },
  });

  return { userId, count: rows.length };
};

const selfDeletions = new WeakMap<Request, string>();

const deletionParents = new WeakMap<
  Request,
  { parent: DeletionParent; sinceId: string }
>();

export const authHooks = {
  before: createAuthMiddleware(async (ctx) => {
    if (ctx.path === '/admin/remove-user' || SELF_DELETE_PATHS.has(ctx.path)) {
      const session = await getSessionFromCtx(ctx);
      const isSelfDelete = SELF_DELETE_PATHS.has(ctx.path);
      const userId = isSelfDelete
        ? session?.user.id
        : session?.user.role === 'admin'
          ? asString(asRow(ctx.body)?.userId)
          : undefined;

      if (userId) {
        await assertUserDeletable(userId);
        if (isSelfDelete && ctx.request) selfDeletions.set(ctx.request, userId);
        if (ctx.request)
          deletionParents.set(ctx.request, {
            parent: { table: 'user', id: userId },
            sinceId: await latestDeletedRecordId(),
          });
      }
    }

    if (ctx.path === '/organization/delete' && ctx.request) {
      const organizationId = asString(asRow(ctx.body)?.organizationId);
      if (organizationId)
        deletionParents.set(ctx.request, {
          parent: { table: 'organization', id: organizationId },
          sinceId: await latestDeletedRecordId(),
        });
    }

    if (ORGANIZATION_WRITE_PATHS.has(ctx.path)) {
      const session = await getSessionFromCtx(ctx);
      if (session)
        await assertOrganizationOpen(
          asRow(ctx.body) ?? {},
          asString(asRow(session.session)?.activeOrganizationId),
        );
    }

    if (REVOKE_SESSION_PATHS.has(ctx.path) && ctx.request) {
      try {
        snapshots.set(
          ctx.request,
          await countRevokedSessions(ctx.path, asRow(ctx.body) ?? {}),
        );
      } catch (error) {
        logger.error('Failed to snapshot audit target', error);
      }
    }

    const target = BEFORE_TARGETS[ctx.path]?.(asRow(ctx.body) ?? {});
    if (!target || !ctx.request) return;

    try {
      snapshots.set(ctx.request, await findRow(target));
    } catch (error) {
      logger.error('Failed to snapshot audit target', error);
    }
  }),
  after: createAuthMiddleware(async (ctx) => {
    const before = ctx.request ? snapshots.get(ctx.request) : undefined;
    const selfDeletedUserId = ctx.request
      ? selfDeletions.get(ctx.request)
      : undefined;
    const deletion = ctx.request ? deletionParents.get(ctx.request) : undefined;
    if (ctx.request) {
      snapshots.delete(ctx.request);
      selfDeletions.delete(ctx.request);
      deletionParents.delete(ctx.request);
    }

    if (deletion && !isAPIError(ctx.context.returned))
      try {
        await mergePreDeletedChildren(deletion.parent, deletion.sinceId);
      } catch (error) {
        logger.error(
          'Failed to merge pre-deleted rows into their batch',
          error,
        );
      }

    if (selfDeletedUserId && !isAPIError(ctx.context.returned))
      try {
        const remaining = await db.query.user.findFirst({
          where: eq(schema.user.id, selfDeletedUserId),
          columns: { id: true },
        });
        if (!remaining) await forgetDeletedUser(selfDeletedUserId);
      } catch (error) {
        logger.error('Failed to erase deleted account copies', error);
      }

    const returned = asRow(ctx.context.returned);
    if (!returned || isAPIError(returned)) return;

    const events = toEvents(ctx.path, asRow(ctx.body) ?? {}, returned, before);
    if (!events.length) return;

    try {
      const actor =
        ctx.context.session?.user ?? (await getSessionFromCtx(ctx))?.user;
      if (!actor) return;

      for (const event of events) await writeEvent(actor, event);
    } catch (error) {
      logger.error('Failed to write audit log', error);
    }
  }),
};
