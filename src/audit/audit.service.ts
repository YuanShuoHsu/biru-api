import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  and,
  arrayContains,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNull,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';

import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';
import { auditLog } from 'src/db/schema/audit';
import { organization } from 'src/db/schema/organizations';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import {
  AUDIT_LOG_DATE_FILTER_FIELDS,
  AUDIT_LOG_ENUM_FILTER_FIELDS,
  AUDIT_LOG_STRING_FILTER_FIELDS,
  type AuditLogPaginationQueryDto,
} from './dto/audit-log-pagination-query.dto';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';

@Injectable()
export class AuditService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async listForOrganization(
    organizationSlug: string,
    query: AuditLogPaginationQueryDto = {},
  ): Promise<{ data: AuditLogResponseDto[]; total: number }> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    return this.list(eq(auditLog.organizationId, org.id), query);
  }

  listForPlatform(
    query: AuditLogPaginationQueryDto = {},
  ): Promise<{ data: AuditLogResponseDto[]; total: number }> {
    return this.list(isNull(auditLog.organizationId), query);
  }

  private async list(
    scope: SQL,
    query: AuditLogPaginationQueryDto,
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

    const fieldMap: Record<string, Column | SQL> = {
      actorName: auditLog.actorName,
      actorEmail: auditLog.actorEmail,
      resourceId: auditLog.resourceId,
      resource: sql`${auditLog.resource}::text`,
      action: sql`${auditLog.action}::text`,
      createdAt: auditLog.createdAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy: SQL[] = sortBy
      ? [dir(fieldMap[sortBy]), desc(auditLog.createdAt)]
      : [desc(auditLog.createdAt)];

    const where = and(
      scope,
      resource ? eq(auditLog.resource, resource) : undefined,
      resourceId ? eq(auditLog.resourceId, resourceId) : undefined,
      ancestorId
        ? arrayContains(auditLog.ancestorIds, [ancestorId])
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
          ilike(auditLog.actorName, `%${value}%`),
          ilike(auditLog.actorEmail, `%${value}%`),
          ilike(auditLog.resourceId, `%${value}%`),
          ilike(localTimeText(auditLog.createdAt), `%${value}%`),
        ],
      }),
    );

    const [data, [{ total }]] = await Promise.all([
      this.db.query.auditLog.findMany({ where, orderBy, limit, offset }),
      this.db.select({ total: count() }).from(auditLog).where(where),
    ]);

    return { data, total };
  }
}
