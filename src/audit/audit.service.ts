import { Inject, Injectable } from '@nestjs/common';

import { and, ilike, sql, type SQL } from 'drizzle-orm';

import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from '../common/utils/data-grid-filters.js';
import type { AuditChangeLabels } from '../db/schema/audit.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';

import {
  attendanceEmployeeId,
  isLabeledField,
  LABELED_FIELDS,
  type LabeledField,
  readableAttendanceActions,
  toAuditLogChanges,
} from './attendance-audit-entries.js';
import {
  AUDIT_LOG_DATE_FILTER_FIELDS,
  AUDIT_LOG_ENUM_FILTER_FIELDS,
  AUDIT_LOG_STRING_FILTER_FIELDS,
  PLATFORM_ORGANIZATION_ID,
  type AuditLogPaginationQueryDto,
} from './dto/audit-log-pagination-query.dto.js';
import type { AuditLogResponseDto } from './dto/audit-log-response.dto.js';

type AuditLogRow = Omit<AuditLogResponseDto, 'createdAt' | 'changes'> & {
  changes: Record<string, unknown>;
  createdAt: string;
  source: 'audit' | 'attendance';
  targetEmployeeName: string | null;
};

const entry = (column: string) => sql.raw(`entry.${column}`);

@Injectable()
export class AuditService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  listForOrganization(
    organizationId: string,
    role: string,
    query: AuditLogPaginationQueryDto = {},
  ): Promise<{ data: AuditLogResponseDto[]; total: number }> {
    return this.list(query, { organizationId, role });
  }

  listAll(
    query: AuditLogPaginationQueryDto = {},
  ): Promise<{ data: AuditLogResponseDto[]; total: number }> {
    return this.list(query);
  }

  private async list(
    query: AuditLogPaginationQueryDto,
    scope?: { organizationId: string; role: string },
  ): Promise<{ data: AuditLogResponseDto[]; total: number }> {
    const {
      limit = 10,
      offset = 0,
      ancestorId,
      resource,
      resourceId,
      filterField,
      filterOperator,
      filterValue,
      quickFilterEnums,
      quickFilterValue,
      sortBy,
      sortDirection = 'desc',
    } = query;

    const fieldMap: Record<string, SQL> = {
      actorName: entry('"actorName"'),
      actorEmail: entry('"actorEmail"'),
      resourceId: entry('"resourceId"'),
      organizationId: sql`COALESCE(${entry('"organizationId"')}, ${PLATFORM_ORGANIZATION_ID})`,
      resource: entry('resource'),
      action: entry('action'),
      createdAt: entry('created_at'),
    };

    const where = and(
      resource ? sql`${fieldMap.resource} = ${resource}` : undefined,
      resourceId ? sql`${fieldMap.resourceId} = ${resourceId}` : undefined,
      ancestorId
        ? sql`${ancestorId} = ANY(${entry('"ancestorIds"')})`
        : undefined,
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            AUDIT_LOG_STRING_FILTER_FIELDS,
            AUDIT_LOG_DATE_FILTER_FIELDS,
            AUDIT_LOG_ENUM_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: AUDIT_LOG_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(fieldMap.actorName, `%${value}%`),
          ilike(fieldMap.actorEmail, `%${value}%`),
          ilike(fieldMap.resourceId, `%${value}%`),
          ilike(localTimeText(fieldMap.createdAt), `%${value}%`),
        ],
      }),
    );

    const direction = sql.raw(sortDirection === 'desc' ? 'DESC' : 'ASC');
    const orderBy = sortBy
      ? sql`${fieldMap[sortBy]} ${direction}, ${fieldMap.createdAt} DESC`
      : sql`${fieldMap.createdAt} DESC`;

    const entries = this.entries(scope);
    const filtered = sql`FROM (${entries}) entry ${where ? sql`WHERE ${where}` : sql``}`;

    const [{ rows }, { rows: totals }] = await Promise.all([
      this.db.execute<AuditLogRow>(sql`
        SELECT
          entry.source,
          entry.id,
          entry."actorId",
          entry."actorName",
          entry."actorEmail",
          entry."organizationId",
          entry.resource,
          entry."resourceId",
          entry."resourceLabel",
          entry."ancestorIds",
          entry.action,
          entry.changes,
          entry."changeLabels",
          ${fieldMap.createdAt} AT TIME ZONE 'UTC' AS "createdAt",
          CASE WHEN entry.source = 'attendance' THEN (
            SELECT u.name FROM attendance_employee e
            JOIN "user" u ON u.id = e.user_id
            WHERE e.id = COALESCE(
              ${attendanceEmployeeId(entry('resource'), entry('"resourceId"'))},
              entry.changes ->> 'employeeId',
              entry.changes -> 'after' ->> 'employeeId'
            )
          ) END AS "targetEmployeeName"
        ${filtered}
        ORDER BY ${orderBy}
        LIMIT ${limit} OFFSET ${offset}
      `),
      this.db.execute<{ total: number }>(
        sql`SELECT count(*)::int AS total ${filtered}`,
      ),
    ]);

    const attendanceLogs = new Set<AuditLogResponseDto>();
    const logs = rows.map(
      ({
        source,
        targetEmployeeName,
        createdAt,
        ...row
      }): AuditLogResponseDto => {
        if (source === 'audit')
          return {
            ...row,
            changes: row.changes as AuditLogResponseDto['changes'],
            createdAt: new Date(createdAt),
          };

        const changes = toAuditLogChanges(row.action, row.changes);
        const name = changes.name?.after ?? changes.name?.before;
        const log = {
          ...row,
          changes,
          createdAt: new Date(createdAt),
          resourceLabel:
            targetEmployeeName ?? (typeof name === 'string' ? name : null),
        };
        attendanceLogs.add(log);
        return log;
      },
    );

    const labels = await this.changeLabels(
      [...attendanceLogs].map(({ changes }) => changes),
    );

    for (const log of attendanceLogs)
      log.changeLabels = Object.fromEntries(
        Object.keys(log.changes).flatMap((field) =>
          labels[field] ? [[field, labels[field]]] : [],
        ),
      );

    return { data: logs, total: totals[0]?.total ?? 0 };
  }

  private entries(scope?: { organizationId: string; role: string }): SQL {
    const auditLogs = sql`
      SELECT
        'audit' AS source,
        a.id,
        a.actor_id AS "actorId",
        a.actor_name AS "actorName",
        a.actor_email AS "actorEmail",
        a.organization_id AS "organizationId",
        a.resource::text AS resource,
        a.resource_id AS "resourceId",
        a.resource_label AS "resourceLabel",
        a.ancestor_ids AS "ancestorIds",
        a.action::text AS action,
        a.changes,
        a.change_labels AS "changeLabels",
        a.created_at
      FROM audit_log a
      ${scope ? sql`WHERE a.organization_id = ${scope.organizationId}` : sql``}
    `;

    const readable = readableAttendanceActions(scope?.role);
    if (!readable.length) return auditLogs;

    return sql`
      ${auditLogs}
      UNION ALL
      SELECT
        'attendance',
        aa.id,
        aa.actor_id,
        actor.name,
        actor.email,
        aa.organization_id,
        kind.resource,
        aa.resource_id,
        NULL::jsonb,
        NULL::text[],
        kind.action,
        aa.changes,
        NULL::jsonb,
        aa.created_at AT TIME ZONE 'UTC'
      FROM attendance_audit aa
      JOIN (VALUES ${sql.join(
        readable.map(
          ([source, { resource, action }]) =>
            sql`(${source}, ${resource}, ${action})`,
        ),
        sql`, `,
      )}) AS kind (source, resource, action) ON kind.source = aa.action
      LEFT JOIN "user" actor ON actor.id = aa.actor_id
      ${scope ? sql`WHERE aa.organization_id = ${scope.organizationId}` : sql``}
    `;
  }

  private async changeLabels(
    changes: AuditLogResponseDto['changes'][],
  ): Promise<AuditChangeLabels> {
    const ids = new Map<LabeledField, Set<string>>();
    for (const entries of changes)
      for (const [field, change] of Object.entries(entries)) {
        if (!isLabeledField(field)) continue;
        for (const value of [change.before, change.after])
          if (typeof value === 'string')
            ids.set(field, (ids.get(field) ?? new Set()).add(value));
      }
    if (!ids.size) return {};

    const { rows } = await this.db.execute<{
      field: string;
      id: string;
      label: string;
    }>(
      sql.join(
        [...ids].map(
          ([field, values]) => sql`
            (SELECT ${field} AS field, source.id, source.label
            FROM (${LABELED_FIELDS[field]}) source
            WHERE source.id IN (${sql.join(
              [...values].map((value) => sql`${value}`),
              sql`, `,
            )}))`,
        ),
        sql` UNION ALL `,
      ),
    );

    const labels: AuditChangeLabels = {};
    for (const { field, id, label } of rows) (labels[field] ??= {})[id] = label;
    return labels;
  }
}
