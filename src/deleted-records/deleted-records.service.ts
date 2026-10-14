import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { and, asc, eq, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { v4 as uuidv4 } from 'uuid';

import type { AttendanceActor } from 'src/attendance/attendance-actor';
import type {
  RestoredRecord,
  Transaction,
} from 'src/attendance/attendance-audit';
import { AttendanceEmployeesService } from 'src/attendance/attendance-employees.service';
import { AttendanceLeavesService } from 'src/attendance/attendance-leaves.service';
import { AttendanceShiftTypesService } from 'src/attendance/attendance-shift-types.service';
import { isAuthorized } from 'src/auth/permissions';
import { platformDateString } from 'src/common/constants/timezone';
import type { AuditSubTable } from 'src/common/decorators/audit.decorator';
import { diffAuditRows } from 'src/common/utils/audit-diff';
import {
  AUDIT_IGNORED_COLUMNS,
  resolveAuditLabels,
  resolveChangeLabels,
} from 'src/common/utils/audit-resources';
import {
  ATTENDANCE_LEGAL_STATUSES,
  ATTENDANCE_TERMINATION_REASONS,
  attendanceEmployee,
} from 'src/db/schema/attendance';
import { auditLog, type AuditResource } from 'src/db/schema/audit';
import { deletedRecord } from 'src/db/schema/deleted-records';
import type { LocalizedText } from 'src/db/schema/enums';
import { member, organization } from 'src/db/schema/organizations';
import { PAYROLL_EARNING_CATEGORIES } from 'src/db/schema/payroll';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';
import {
  MENU_UPDATED_EVENT,
  type MenuUpdatedEvent,
} from 'src/events/menu-updated.event';
import type { I18nTranslations } from 'src/generated/i18n.generated';
import { CLOSED_WRITABLE_RESOURCES } from 'src/menus/guards/roles.guard';
import { PayrollEarningsService } from 'src/payroll/payroll-earnings.service';
import {
  asBoolean,
  asNumber,
  asPeriods,
  asString,
  asStrings,
  toCamelRow,
} from './deleted-row';

import {
  LABEL_COLUMNS,
  RESTORABLE_TABLES,
  RESTORE_PERMISSIONS,
  SERVICE_RESTORED_TABLES,
  UNTRACKED_TABLES,
  type RestorableTable,
} from './deleted-record-tables';
import type {
  DeletedRecordBatchResponseDto,
  DeletedRecordPaginationQueryDto,
} from './dto/deleted-record-batch.dto';
import { isPreDeletedChild, preDeletedChildCondition } from './request-batch';

const RETENTION_DAYS = 30;

type Row = typeof deletedRecord.$inferSelect;

type Actor = { id: string; name: string; email: string };

export type RestoreScope = {
  organizationId: string;
  role: string;
  closed: boolean;
};

const restorableTablesFor = (role: string) =>
  Object.entries(RESTORE_PERMISSIONS).flatMap(([table, action]) =>
    action && isAuthorized(role, action) ? [table] : [],
  );

export const canRestoreAnything = (role: string) =>
  RESTORABLE_TABLES.some((table) => restorableTablesFor(role).includes(table));

const canRestoreTables = (tables: string[], scope: RestoreScope) => {
  const required = tables.map((table) => RESTORE_PERMISSIONS[table]);
  if (!required.length || required.some((action) => !action)) return false;

  const action: Record<string, string[]> = {};
  for (const entry of required)
    for (const [resource, verbs] of Object.entries(entry ?? {}))
      action[resource] = [...new Set([...(action[resource] ?? []), ...verbs])];

  return (
    isAuthorized(scope.role, action) &&
    (!scope.closed ||
      Object.keys(action).every((resource) =>
        CLOSED_WRITABLE_RESOURCES.has(resource),
      ))
  );
};

const AUDIT_TARGETS: Partial<
  Record<
    RestorableTable,
    {
      resource: AuditResource;
      via?: { scope: AuditSubTable; ownerColumn: string };
      membership?: { ownerColumn: string; memberColumn: string };
    }
  >
> = {
  banner: { resource: 'banner' },
  coupon: { resource: 'coupon' },
  ingredient: { resource: 'ingredient' },
  invitation: { resource: 'invitation' },
  member: { resource: 'member' },
  menu_item: { resource: 'menuItem' },
  menu_item_add_on: { resource: 'menuItemAddOn' },
  menu_item_modifier_group: { resource: 'menuItemModifierGroup' },
  menu_section: { resource: 'menuSection' },
  modifier: { resource: 'modifier' },
  modifier_group: { resource: 'modifierGroup' },
  offer: {
    resource: 'menuItem',
    via: { scope: 'offer', ownerColumn: 'menu_item_id' },
  },
  organization: { resource: 'organization' },
  recipe: { resource: 'recipe' },
  recipe_ingredient: {
    resource: 'recipe',
    via: { scope: 'recipeIngredient', ownerColumn: 'recipe_id' },
  },
  supplier: { resource: 'supplier' },
  team: { resource: 'team' },
  team_member: {
    resource: 'team',
    membership: { ownerColumn: 'team_id', memberColumn: 'user_id' },
  },
  user: { resource: 'user' },
};

const MENU_TABLES = new Set<string>([
  'menu_section',
  'menu_item',
  'offer',
  'menu_item_add_on',
  'modifier_group',
  'modifier',
  'menu_item_modifier_group',
]);

const isRestorable = (table: string): table is RestorableTable =>
  (RESTORABLE_TABLES as readonly string[]).includes(table);

const isLocalizedText = (value: unknown): value is LocalizedText =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((text) => typeof text === 'string');

const getLabel = (data: Row['data']): string | LocalizedText | null => {
  for (const column of LABEL_COLUMNS) {
    const value = data[column];
    if ((typeof value === 'string' && value) || isLocalizedText(value))
      return value;
  }

  return null;
};

const pgErrorCode = (error: unknown) =>
  (error as { cause?: { code?: string } }).cause?.code;

const organizationIdOf = (tableName: SQL, recordId: SQL, data: SQL) => sql`
  COALESCE(
    CASE WHEN ${tableName} = 'organization' THEN ${recordId} END,
    ${data} ->> 'organization_id',
    ${data} ->> 'seller_id',
    (SELECT organization_id FROM recipe WHERE id = ${data} ->> 'recipe_id'),
    (SELECT organization_id FROM team WHERE id = ${data} ->> 'team_id'),
    (
      SELECT m.organization_id FROM menu m
      WHERE m.id = COALESCE(
        ${data} ->> 'menu_id',
        (SELECT menu_id FROM menu_section WHERE id = ${data} ->> 'menu_section_id'),
        (
          SELECT COALESCE(i.menu_id, s.menu_id)
          FROM menu_item i
          LEFT JOIN menu_section s ON s.id = i.menu_section_id
          WHERE i.id = ${data} ->> 'menu_item_id'
        ),
        (SELECT menu_id FROM modifier_group WHERE id = ${data} ->> 'modifier_group_id')
      )
    )
  )
`;

@Injectable()
export class DeletedRecordsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeletedRecordsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly attendanceEmployees: AttendanceEmployeesService,
    private readonly attendanceLeaves: AttendanceLeavesService,
    private readonly attendanceShiftTypes: AttendanceShiftTypesService,
    private readonly eventEmitter: EventEmitter2,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly payrollEarnings: PayrollEarningsService,
  ) {}

  private t(key: 'restoreConflict' | 'restoreMissingReference'): string {
    return this.i18n.t(`common.deletedRecords.${key}`, {
      lang: I18nContext.current()?.lang,
    });
  }

  async onApplicationBootstrap() {
    try {
      const { rows } = await this.db.execute<{ table: string }>(sql`
        SELECT t.tablename AS table
        FROM pg_tables t
        WHERE t.schemaname = 'public'
          AND t.tablename NOT IN (${sql.join(
            UNTRACKED_TABLES.map((table) => sql`${table}`),
            sql`, `,
          )})
          AND NOT EXISTS (
            SELECT 1 FROM pg_trigger g
            JOIN pg_class c ON c.oid = g.tgrelid
            WHERE c.relname = t.tablename
              AND g.tgname = 'record_deleted_row'
          )
      `);

      if (rows.length)
        this.logger.warn(
          `以下資料表刪除時不會留存，請補上 record_deleted_row trigger：${rows
            .map(({ table }) => table)
            .join(', ')}`,
        );
    } catch (error) {
      this.logger.error('檢查刪除留存 trigger 失敗', error);
    }
  }

  async list(
    { limit = 10, offset = 0 }: DeletedRecordPaginationQueryDto,
    scope?: RestoreScope,
  ): Promise<{
    data: DeletedRecordBatchResponseDto[];
    total: number;
  }> {
    const restorable = sql.join(
      RESTORABLE_TABLES.map((table) => sql`${table}`),
      sql`, `,
    );

    const roots = sql`
      SELECT DISTINCT ON (d.batch_id) d.*
      FROM deleted_record d
      WHERE d.table_name IN (${restorable})
        ${
          scope
            ? sql`
              AND ${organizationIdOf(sql`d.table_name`, sql`d.record_id`, sql`d.data`)} = ${scope.organizationId}
              AND NOT EXISTS (
                SELECT 1 FROM deleted_record other
                WHERE other.batch_id = d.batch_id
                  AND other.table_name NOT IN (${sql.join(
                    [...restorableTablesFor(scope.role), ''].map(
                      (table) => sql`${table}`,
                    ),
                    sql`, `,
                  )})
              )`
            : sql``
        }
      ORDER BY d.batch_id, ${preDeletedChildCondition('d')}, d.id
    `;

    const [{ rows }, { rows: totals }] = await Promise.all([
      this.db.execute<{
        batch_id: string;
        deleted_at: Date;
        table_name: string;
        record_id: string | null;
        data: Row['data'];
        related_count: number;
        organization_name: string | null;
        user_name: string | null;
        deleted_by: string | null;
        tables: string[];
      }>(sql`
        WITH roots AS (${roots})
        SELECT
          r.batch_id,
          r.deleted_at AT TIME ZONE 'UTC' AS deleted_at,
          r.table_name,
          r.record_id,
          r.data,
          (SELECT count(*)::int - 1 FROM deleted_record d WHERE d.batch_id = r.batch_id) AS related_count,
          (SELECT array_agg(DISTINCT t.table_name) FROM deleted_record t WHERE t.batch_id = r.batch_id) AS tables,
          o.name AS organization_name,
          u.name AS user_name,
          COALESCE(
            (
              SELECT a.actor_name FROM audit_log a
              WHERE (
                  (a.resource_id = r.record_id AND a.action = 'delete')
                  OR a.resource_id IN (
                    r.data ->> 'team_id',
                    r.data ->> 'menu_item_id',
                    r.data ->> 'recipe_id'
                  )
                )
                AND a.created_at BETWEEN r.deleted_at - interval '1 minute' AND r.deleted_at + interval '1 minute'
              ORDER BY abs(extract(epoch FROM a.created_at - r.deleted_at))
              LIMIT 1
            ),
            (
              SELECT actor.name FROM attendance_audit aa
              JOIN "user" actor ON actor.id = aa.actor_id
              WHERE aa.resource_id = r.record_id
                AND aa.created_at BETWEEN r.deleted_at - interval '1 minute' AND r.deleted_at + interval '1 minute'
              ORDER BY abs(extract(epoch FROM aa.created_at - r.deleted_at))
              LIMIT 1
            )
          ) AS deleted_by
        FROM roots r
        LEFT JOIN organization o
          ON o.id = ${organizationIdOf(sql`r.table_name`, sql`r.record_id`, sql`r.data`)}
        LEFT JOIN "user" u ON u.id = COALESCE(
          r.data ->> 'user_id',
          (SELECT e.user_id FROM attendance_employee e WHERE e.id = r.data ->> 'employee_id')
        )
        ORDER BY r.deleted_at DESC, r.batch_id DESC
        LIMIT ${sql.raw(String(limit))} OFFSET ${sql.raw(String(offset))}
      `),
      this.db.execute<{ total: number }>(
        sql`SELECT count(*)::int AS total FROM (${roots}) roots`,
      ),
    ]);

    return {
      data: rows.flatMap((row) =>
        isRestorable(row.table_name)
          ? [
              {
                batchId: Number(row.batch_id),
                deletedAt: row.deleted_at,
                tableName: row.table_name,
                recordId: row.record_id,
                label: getLabel(row.data) ?? row.user_name,
                organizationName:
                  row.organization_name ??
                  (row.table_name === 'organization' &&
                  typeof row.data.name === 'string'
                    ? row.data.name
                    : null),
                relatedCount: row.related_count,
                deletedBy: row.deleted_by,
                canRestore: !scope || canRestoreTables(row.tables, scope),
              },
            ]
          : [],
      ),
      total: totals[0]?.total ?? 0,
    };
  }

  async restore(
    batchIds: number[],
    actor: Actor,
    scope?: RestoreScope,
  ): Promise<void> {
    const batches = (
      await Promise.all(
        batchIds.map((batchId) => this.loadBatch(batchId, scope)),
      )
    ).toSorted((a, b) => b.root.id - a.root.id);

    try {
      await this.db.transaction(async (tx) => {
        for (const { root, batch } of batches) {
          if (SERVICE_RESTORED_TABLES.has(root.tableName)) {
            await this.restoreThroughService(root, batch, actor, tx);
            continue;
          }

          await this.insertRows(tx, batch);
          await tx.delete(deletedRecord).where(
            inArray(
              deletedRecord.id,
              batch.map(({ id }) => id),
            ),
          );
        }
      });
    } catch (error) {
      throw this.toRestoreError(error);
    }

    for (const { root } of batches) {
      if (SERVICE_RESTORED_TABLES.has(root.tableName)) continue;

      const organizationId = await this.resolveOrganizationId(root);

      if (organizationId && MENU_TABLES.has(root.tableName))
        this.eventEmitter.emit(MENU_UPDATED_EVENT, {
          organizationId,
        } satisfies MenuUpdatedEvent);

      try {
        await this.writeRestoreAudit(root, organizationId, actor);
      } catch (error) {
        this.logger.error('Failed to write audit log', error);
      }
    }
  }

  private async loadBatch(batchId: number, scope?: RestoreScope) {
    const batch = await this.db
      .select()
      .from(deletedRecord)
      .where(eq(deletedRecord.batchId, batchId))
      .orderBy(asc(deletedRecord.id));

    const batchTables = new Set(batch.map(({ tableName }) => tableName));
    const root = batch.find(
      ({ tableName }) =>
        isRestorable(tableName) && !isPreDeletedChild(tableName, batchTables),
    );
    if (!root) throw new NotFoundException('Deleted record batch not found');

    if (scope) {
      if ((await this.resolveOrganizationId(root)) !== scope.organizationId)
        throw new NotFoundException('Deleted record batch not found');
      if (!canRestoreTables([...batchTables], scope))
        throw new ForbiddenException();
    }

    return { root, batch };
  }

  async getScope(organizationId: string, role: string): Promise<RestoreScope> {
    const [row] = await this.db
      .select({ closedAt: organization.closedAt })
      .from(organization)
      .where(eq(organization.id, organizationId));

    return { organizationId, role, closed: !!row?.closedAt };
  }

  private toRestoreError(error: unknown) {
    const code = pgErrorCode(error);
    if (code === '23505')
      return new ConflictException(this.t('restoreConflict'));
    if (code === '23503')
      return new ConflictException(this.t('restoreMissingReference'));

    return error;
  }

  private async restoreThroughService(
    root: Row,
    batch: Row[],
    admin: Actor,
    tx: Transaction,
  ) {
    const data = toCamelRow(root.tableName, root.data);
    const organizationId = asString(data.organizationId);
    if (!organizationId || !root.recordId)
      throw new NotFoundException('Deleted record batch not found');

    const [membership] = await tx
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, admin.id),
        ),
      );
    const actor: AttendanceActor = {
      organizationId,
      userId: admin.id,
      role: membership?.role ?? '',
    };
    const removeRetained = async (tx: Transaction) => {
      await tx
        .delete(deletedRecord)
        .where(eq(deletedRecord.batchId, root.batchId));
    };
    const restored: RestoredRecord = {
      id: root.recordId,
      createdBy: asString(data.createdBy) ?? admin.id,
      finalize: removeRetained,
      tx,
    };

    switch (root.tableName) {
      case 'attendance_employee': {
        const userId = asString(data.userId) ?? '';
        const [current] = await tx
          .select({ id: attendanceEmployee.id })
          .from(attendanceEmployee)
          .where(
            and(
              eq(attendanceEmployee.organizationId, organizationId),
              eq(attendanceEmployee.userId, userId),
            ),
          );
        if (current) throw new ConflictException(this.t('restoreConflict'));

        const toDay = (value: unknown) => {
          const text = asString(value);

          return text ? platformDateString(new Date(text)) : undefined;
        };

        await this.attendanceEmployees.saveEmployee(
          actor,
          {
            userId,
            birthDate: asString(data.birthDate) ?? '',
            taiwanStaySince: asString(data.taiwanStaySince) ?? undefined,
            legalStatus:
              ATTENDANCE_LEGAL_STATUSES.find(
                (status) => status === data.legalStatus,
              ) ?? 'national',
            studentVacations: asPeriods(data.studentVacations),
            workPermits: asPeriods(data.workPermits),
            pregnancyPeriods: asPeriods(data.pregnancyPeriods),
            nursingPeriods: asPeriods(data.nursingPeriods),
            indigenousHolidays: asStrings(data.indigenousHolidays),
            regularLeaveWeekday:
              asNumber(data.regularLeaveWeekday) ?? undefined,
            restDayWeekday: asNumber(data.restDayWeekday) ?? undefined,
            hiredAt: toDay(data.hiredAt) ?? '',
            terminatedAt: toDay(data.terminatedAt),
            terminationReason: ATTENDANCE_TERMINATION_REASONS.find(
              (reason) => reason === data.terminationReason,
            ),
            terminationNoticedAt: toDay(data.terminationNoticedAt),
          },
          restored,
        );
        return;
      }
      case 'attendance_shift_type':
        await this.attendanceShiftTypes.createShiftType(
          actor,
          {
            name: asString(data.name) ?? '',
            startTime: asString(data.startTime) ?? '',
            endTime: asString(data.endTime) ?? '',
          },
          restored,
        );
        return;
      case 'attendance_leave_type':
        await this.attendanceLeaves.saveLeaveType(
          actor,
          {
            name: asString(data.name) ?? '',
            paidPercent: asNumber(data.paidPercent),
            requiresBalance: asBoolean(data.requiresBalance),
            enabled: asBoolean(data.enabled) ?? true,
          },
          undefined,
          {
            ...restored,
            finalize: async (tx) => {
              await this.insertRows(
                tx,
                batch.filter(
                  ({ tableName }) => tableName === 'attendance_leave_balance',
                ),
              );
              await removeRetained(tx);
            },
          },
        );
        return;
      case 'attendance_leave_case':
        await this.attendanceLeaves.restoreLeaveCase(
          actor,
          {
            employeeId: asString(data.employeeId) ?? '',
            leaveTypeId: asString(data.leaveTypeId) ?? '',
            reference: asString(data.reference) ?? undefined,
            childId: asString(data.childId) ?? undefined,
            eventDate: asString(data.eventDate) ?? undefined,
            startsAt: asString(data.startsAt) ?? '',
            endsAt: asString(data.endsAt) ?? undefined,
            reason: asString(data.reason) ?? '',
            // 店家同意只放寬日期限制且不入庫；原案件能建立就代表日期當時合法，視為同意才不會擋下原本合法的案件
            earlyParentalAgreed: true,
            extensionAgreed: true,
          },
          restored,
        );
        return;
      case 'attendance_annual_leave_deferral':
        await this.attendanceLeaves.createAnnualLeaveDeferral(
          actor,
          {
            employeeId: asString(data.employeeId) ?? '',
            periodStart: asString(data.periodStart) ?? '',
            reason: asString(data.reason) ?? '',
          },
          restored,
        );
        return;
      case 'attendance_holiday_substitute':
        await this.attendanceLeaves.createHolidaySubstitute(
          actor,
          {
            employeeId: asString(data.employeeId) ?? '',
            holidayDate: asString(data.holidayDate) ?? '',
            shiftId: asString(data.shiftId) ?? '',
          },
          restored,
        );
        return;
      case 'payroll_earning_type':
        await this.payrollEarnings.createEarningType(
          actor,
          {
            name: asString(data.name) ?? '',
            category:
              PAYROLL_EARNING_CATEGORIES.find(
                (category) => category === data.category,
              ) ?? 'wage',
          },
          restored,
        );
        return;
    }
  }

  private async resolveOrganizationId({
    tableName,
    recordId,
    data,
  }: Row): Promise<string | null> {
    const { rows } = await this.db.execute<{ organization_id: string | null }>(
      sql`SELECT ${organizationIdOf(
        sql`${tableName}::text`,
        sql`${recordId}::text`,
        sql`${JSON.stringify(data)}::jsonb`,
      )} AS organization_id`,
    );

    return rows[0]?.organization_id ?? null;
  }

  private async writeRestoreAudit(
    root: Row,
    organizationId: string | null,
    actor: Actor,
  ) {
    if (!isRestorable(root.tableName)) return;

    const target = AUDIT_TARGETS[root.tableName];
    const ownerColumn =
      target?.via?.ownerColumn ?? target?.membership?.ownerColumn;
    const resourceId = ownerColumn
      ? asString(root.data[ownerColumn])
      : root.recordId;
    if (!target || !resourceId) return;

    const changes = target.membership
      ? {
          member: {
            before: null,
            after: root.data[target.membership.memberColumn] ?? null,
          },
        }
      : diffAuditRows(
          undefined,
          toCamelRow(root.tableName, root.data),
          AUDIT_IGNORED_COLUMNS[target.via?.scope ?? target.resource],
        );
    const [labels, [changeLabels]] = await Promise.all([
      resolveAuditLabels(
        this.db,
        target.resource,
        new Map([[resourceId, undefined]]),
      ),
      resolveChangeLabels(this.db, [
        { scope: target.via?.scope ?? target.resource, changes },
      ]),
    ]);
    const label = labels.get(resourceId);

    await this.db.insert(auditLog).values({
      id: uuidv4(),
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      organizationId:
        root.tableName === 'organization' ? root.recordId : organizationId,
      resource: target.resource,
      resourceId,
      resourceLabel: label?.resourceLabel ?? getLabel(root.data),
      ancestorIds: label?.ancestorIds ?? [],
      action: ownerColumn ? 'update' : 'create',
      changes,
      changeLabels,
    });
  }

  private async insertRows(tx: Transaction, rows: Row[]) {
    if (!rows.length) return;

    const order = await this.getInsertOrder(tx, [
      ...new Set(rows.map(({ tableName }) => tableName)),
    ]);
    const [columns, setNullReferences] = await Promise.all([
      this.getInsertableColumns(tx, order),
      this.getSetNullReferences(tx, order),
    ]);

    for (const table of order) {
      for (const { data } of rows.filter(
        ({ tableName }) => tableName === table,
      )) {
        const restored = { ...data };
        // 留存之後才新增的欄位不在資料裡，要交給欄位預設值，否則 NOT NULL 欄位會被寫成 null
        const names = sql.join(
          (columns.get(table) ?? [])
            .filter((column) => Object.hasOwn(restored, column))
            .map((column) => sql.identifier(column)),
          sql`, `,
        );

        for (const {
          column,
          parentTable,
          parentColumn,
        } of setNullReferences.get(table) ?? []) {
          const value = restored[column];
          if (typeof value !== 'string') continue;

          const { rows: found } = await tx.execute(sql`
            SELECT 1 FROM ${sql.identifier(parentTable)}
            WHERE ${sql.identifier(parentColumn)} = ${value}
            LIMIT 1
          `);
          if (!found.length) restored[column] = null;
        }

        await tx.execute(sql`
          INSERT INTO ${sql.identifier(table)} (${names})
          SELECT ${names}
          FROM jsonb_populate_record(NULL::${sql.identifier(table)}, ${JSON.stringify(restored)}::jsonb)
        `);
      }
    }
  }

  async purgeExpired(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    const { rowCount } = await this.db
      .delete(deletedRecord)
      .where(lt(deletedRecord.deletedAt, cutoff));

    return rowCount ?? 0;
  }

  private async getInsertOrder(
    tx: Transaction,
    tables: string[],
  ): Promise<string[]> {
    const { rows: edges } = await tx.execute<{
      child: string;
      parent: string;
    }>(sql`
      SELECT child.relname AS child, parent.relname AS parent
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      JOIN pg_class parent ON parent.oid = c.confrelid
      WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
    `);

    const pending = new Set(tables);
    const order: string[] = [];

    while (pending.size) {
      const ready = [...pending].filter(
        (table) =>
          !edges.some(
            ({ child, parent }) =>
              child === table && parent !== table && pending.has(parent),
          ),
      );
      const next = ready.length ? ready : [...pending];

      for (const table of next) {
        order.push(table);
        pending.delete(table);
      }
    }

    return order;
  }

  // ON DELETE SET NULL 的參照目標已不存在時寫回 null，與資料從未被刪時外鍵會做的事相同
  private async getSetNullReferences(
    tx: Transaction,
    tables: string[],
  ): Promise<
    Map<string, { column: string; parentTable: string; parentColumn: string }[]>
  > {
    const { rows } = await tx.execute<{
      table_name: string;
      column_name: string;
      parent_table: string;
      parent_column: string;
    }>(sql`
      SELECT
        child.relname AS table_name,
        a.attname AS column_name,
        parent.relname AS parent_table,
        pa.attname AS parent_column
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      JOIN pg_class parent ON parent.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
      WHERE c.contype = 'f'
        AND c.confdeltype = 'n'
        AND cardinality(c.conkey) = 1
        AND c.connamespace = 'public'::regnamespace
        AND child.relname IN (${sql.join(
          tables.map((table) => sql`${table}`),
          sql`, `,
        )})
    `);

    const references = new Map<
      string,
      { column: string; parentTable: string; parentColumn: string }[]
    >();
    for (const { table_name, column_name, parent_table, parent_column } of rows)
      references.set(table_name, [
        ...(references.get(table_name) ?? []),
        {
          column: column_name,
          parentTable: parent_table,
          parentColumn: parent_column,
        },
      ]);

    return references;
  }

  private async getInsertableColumns(
    tx: Transaction,
    tables: string[],
  ): Promise<Map<string, string[]>> {
    const { rows } = await tx.execute<{
      table_name: string;
      column_name: string;
    }>(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND is_generated = 'NEVER'
        AND table_name IN (${sql.join(
          tables.map((table) => sql`${table}`),
          sql`, `,
        )})
      ORDER BY ordinal_position
    `);

    const columns = new Map<string, string[]>();
    for (const { table_name, column_name } of rows)
      columns.set(table_name, [
        ...(columns.get(table_name) ?? []),
        column_name,
      ]);

    return columns;
  }
}
