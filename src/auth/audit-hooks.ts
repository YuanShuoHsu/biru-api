// https://better-auth.com/docs/concepts/hooks

import { Logger } from '@nestjs/common';

import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { diffAuditRows, type AuditRow } from '../common/utils/audit-diff';
import { resolveChangeLabels } from '../common/utils/audit-resources';
import { db } from '../db';
import * as schema from '../db/schema';
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
  | typeof schema.user;

const TABLES = {
  invitation: schema.invitation,
  member: schema.member,
  organization: schema.organization,
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
  '/organization/update-member-role': ({ memberId }) =>
    toTarget('member')(memberId),
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

export const authAuditHooks = {
  before: createAuthMiddleware(async (ctx) => {
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
    if (ctx.request) snapshots.delete(ctx.request);

    const actor = ctx.context.session?.user;
    const returned = asRow(ctx.context.returned);
    if (!actor || !returned || isAPIError(returned)) return;

    try {
      for (const event of toEvents(
        ctx.path,
        asRow(ctx.body) ?? {},
        returned,
        before,
      ))
        await writeEvent(actor, event);
    } catch (error) {
      logger.error('Failed to write audit log', error);
    }
  }),
};
