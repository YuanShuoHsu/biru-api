import { randomUUID } from 'crypto';

import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { getTableColumns, inArray, or } from 'drizzle-orm';
import { Request } from 'express';
import { from, Observable, switchMap, tap } from 'rxjs';

import {
  auditLog,
  type AuditAction,
  type AuditChanges,
  type AuditResource,
} from 'src/db/schema/audit';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import {
  AUDIT_KEY,
  type AuditIdSource,
  type AuditMetadata,
  type AuditTarget,
} from '../decorators/audit.decorator';
import {
  AUDIT_TABLES,
  resolveAuditLabels,
  resolveChangeLabels,
  type AuditableTable,
  type AuditLabelScope,
} from '../utils/audit-resources';

type Row = Record<string, unknown>;

type SnapshotRow = { resourceId: string; row: Row };

type Locator =
  | { kind: 'ids'; ids: string[] }
  | { kind: 'column'; column: string; values: string[] };

type AuditRequest = Request & {
  params: Record<string, string>;
  organizationId?: string;
  user?: { id: string; name: string; email: string } | null;
};

const ACTION_BY_METHOD: Record<string, AuditAction> = {
  POST: 'create',
  PATCH: 'update',
  PUT: 'update',
  DELETE: 'delete',
};

// id 不會變（建立時列出來也沒有意義），時間戳每次寫入都會變，記錄下來只會淹沒真正的異動。
// organizationId 由稽核列本身記錄，前提是路由掛了 @Roles 讓 RolesGuard 解析出組織
const IGNORED_COLUMNS = new Set([
  'id',
  'organizationId',
  'createdAt',
  'updatedAt',
]);

const scopeOf = (target: AuditTarget): AuditLabelScope =>
  target.via?.table ?? target.resource;

const tableOf = (target: AuditTarget) => AUDIT_TABLES[scopeOf(target)];

const resourceColumnOf = (target: AuditTarget) =>
  target.via?.ownerColumn ?? 'id';

const actionOf = (target: AuditTarget, action: AuditAction): AuditAction =>
  target.via ? 'update' : action;

const pickId = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const { id } = value as { id?: unknown };

  return typeof id === 'string' ? id : undefined;
};

const idsFromResponse = (response: unknown): string[] => {
  const values = Array.isArray(response) ? response : [response];

  return values
    .map(pickId)
    .filter((id): id is string => typeof id === 'string');
};

const idsFromRequest = (
  idSource: AuditIdSource,
  request: AuditRequest,
): string[] => {
  if ('param' in idSource) {
    const value = request.params[idSource.param];

    return value ? [value] : [];
  }

  if ('body' in idSource) {
    const value = (request.body as Row | undefined)?.[idSource.body];

    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  return [];
};

// handler 執行前能定位的列。`response` 來源此時還沒有 id，回 null 代表沒有 before
const locateBefore = (
  idSource: AuditIdSource,
  request: AuditRequest,
): Locator | null => {
  const ids = idsFromRequest(idSource, request);
  if (!ids.length) return null;

  return 'column' in idSource
    ? { kind: 'column', column: idSource.column, values: ids }
    : { kind: 'ids', ids };
};

const locateAfter = (
  idSource: AuditIdSource,
  request: AuditRequest,
  response: unknown,
): Locator | null => {
  if ('response' in idSource) {
    const ids = idsFromResponse(response);
    if (!ids.length) return null;

    return 'column' in idSource
      ? { kind: 'column', column: idSource.column, values: ids }
      : { kind: 'ids', ids };
  }

  return locateBefore(idSource, request);
};

const diff = (
  before: Row | undefined,
  after: Row | undefined,
): AuditChanges => {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const changes: AuditChanges = {};

  for (const key of keys) {
    if (IGNORED_COLUMNS.has(key)) continue;

    const previous = before?.[key] ?? null;
    const next = after?.[key] ?? null;
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;

    changes[key] = { before: previous, after: next };
  }

  return changes;
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const targets = this.reflector.getAllAndOverride<AuditMetadata | undefined>(
      AUDIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!targets?.length || context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<AuditRequest>();
    const action = ACTION_BY_METHOD[request.method];
    const actor = request.user;
    const organizationId = request.organizationId ?? null;
    if (!action || !actor) return next.handle();

    const loadBefore = Promise.all(
      targets.map((target) =>
        this.snapshot(target, locateBefore(target.idSource, request)),
      ),
    );

    return from(loadBefore).pipe(
      switchMap((befores) =>
        next.handle().pipe(
          tap((response: unknown) => {
            // 稽核寫入失敗不該讓已完成的業務操作回傳錯誤
            void this.record({
              action,
              actor,
              befores,
              organizationId,
              request,
              response,
              targets,
            }).catch((error) =>
              this.logger.error('Failed to write audit log', error),
            );
          }),
        ),
      ),
    );
  }

  private async snapshot(
    target: AuditTarget,
    locator: Locator | null,
    // 只有 after 會傳：欄位定位查不到「連結欄位被清空」的列（退券把 userCoupon.orderId
    // 設回 null），漏掉它會把一次更新記成整列消失
    knownIds: string[] = [],
  ): Promise<Map<string, SnapshotRow>> {
    const table = tableOf(target);
    const located = !locator
      ? undefined
      : locator.kind === 'ids'
        ? inArray(table.id, locator.ids)
        : this.columnCondition(table, locator);
    const where = or(
      ...[located, knownIds.length ? inArray(table.id, knownIds) : undefined],
    );
    if (!where) return new Map();

    const rows = await this.db.select().from(table).where(where);
    const resourceColumn = resourceColumnOf(target);
    const entries: [string, SnapshotRow][] = [];

    for (const row of rows) {
      const { id } = row;
      const resourceId = row[resourceColumn];
      if (typeof id === 'string' && typeof resourceId === 'string')
        entries.push([id, { resourceId, row }]);
    }

    return new Map(entries);
  }

  private columnCondition(
    table: AuditableTable,
    locator: Extract<Locator, { kind: 'column' }>,
  ) {
    const column = getTableColumns(table)[locator.column];
    // 欄位名打錯會讓整條稽核靜默消失，寧可吵一點
    if (!column) {
      this.logger.warn(`@Audit column "${locator.column}" does not exist`);

      return undefined;
    }

    return inArray(column, locator.values);
  }

  private async record({
    action,
    actor,
    befores,
    organizationId,
    request,
    response,
    targets,
  }: {
    action: AuditAction;
    actor: { id: string; name: string; email: string };
    befores: Map<string, SnapshotRow>[];
    organizationId: string | null;
    request: AuditRequest;
    response: unknown;
    targets: AuditTarget[];
  }): Promise<void> {
    const values = [];
    // 每個資源要拿來取名稱與祖先 id 的快照列。刪除後查不到，所以優先用 before；
    // via 目標手上是附屬表的列（offer 沒有品項名），塞 undefined 讓 resolver 補查
    const snapshots = new Map<AuditResource, Map<string, Row | undefined>>();

    for (const [index, target] of targets.entries()) {
      const before = befores[index];
      const after =
        action === 'delete'
          ? new Map<string, SnapshotRow>()
          : await this.snapshot(
              target,
              locateAfter(target.idSource, request, response),
              [...before.keys()],
            );

      for (const key of new Set([...before.keys(), ...after.keys()])) {
        const previous = before.get(key);
        const next = after.get(key);
        const resourceId = next?.resourceId ?? previous?.resourceId;
        if (!resourceId) continue;

        const changes = diff(previous?.row, next?.row);
        if (!Object.keys(changes).length) continue;

        const snapshot =
          snapshots.get(target.resource) ?? new Map<string, Row | undefined>();
        const row = target.via ? undefined : (next?.row ?? previous?.row);
        // 同一個 resource 可以掛多個 target（品項本身 + via offer 的改價），
        // via 那筆手上是附屬表的列，不能讓它的 undefined 蓋掉另一筆已備好的列
        if (row || !snapshot.has(resourceId)) snapshot.set(resourceId, row);
        snapshots.set(target.resource, snapshot);

        values.push({
          scope: scopeOf(target),
          log: {
            id: randomUUID(),
            actorId: actor.id,
            actorName: actor.name,
            actorEmail: actor.email,
            organizationId,
            resource: target.resource,
            resourceId,
            action: actionOf(target, action),
            changes,
          },
        });
      }
    }

    if (!values.length) return;

    const [labels, changeLabels] = await Promise.all([
      Promise.all(
        [...snapshots].map(
          async ([resource, rows]) =>
            [
              resource,
              await resolveAuditLabels(this.db, resource, rows),
            ] as const,
        ),
      ).then((entries) => new Map(entries)),
      resolveChangeLabels(
        this.db,
        values.map(({ log, scope }) => ({ changes: log.changes, scope })),
      ),
    ]);

    await this.db.insert(auditLog).values(
      values.map(({ log }, index) => ({
        ...log,
        ...labels.get(log.resource)?.get(log.resourceId),
        changeLabels: changeLabels[index],
      })),
    );
  }
}
