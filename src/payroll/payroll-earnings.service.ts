import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { AttendanceActor } from 'src/attendance/attendance-actor';
import {
  lockOrganization,
  writeAudit,
  type Transaction,
} from 'src/attendance/attendance-audit';
import {
  badRequestError,
  conflictError,
} from 'src/attendance/attendance-errors';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
} from 'src/common/utils/data-grid-filters';
import { payrollEarning, payrollEarningType } from 'src/db/schema/payroll';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import {
  type CreatePayrollEarningTypeDto,
  type PayrollEarningInputDto,
  PAYROLL_EARNING_TYPE_ENUM_FILTER_FIELDS,
  PAYROLL_EARNING_TYPE_STRING_FILTER_FIELDS,
  type PayrollEarningTypePaginationQueryDto,
  type RenamePayrollEarningTypeDto,
} from './dto/payroll-earning.dto';

// 無 join 時 drizzle 不替外層欄位加表名，子查詢內會被解析成 payroll_earning 自己的欄位
const inUseSql = sql<boolean>`exists (select 1 from payroll_earning used where used.earning_type_id = payroll_earning_type.id)`;

@Injectable()
export class PayrollEarningsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async earningTypes(
    actor: AttendanceActor,
    query: PayrollEarningTypePaginationQueryDto,
  ) {
    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterEnums,
      quickFilterValue,
      sortBy,
      sortDirection = 'asc',
    } = query;
    const fieldMap: Record<string, Column | SQL> = {
      name: payrollEarningType.name,
      category: payrollEarningType.category,
    };
    const where = and(
      eq(payrollEarningType.organizationId, actor.organizationId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            PAYROLL_EARNING_TYPE_STRING_FILTER_FIELDS,
            [],
            PAYROLL_EARNING_TYPE_ENUM_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: PAYROLL_EARNING_TYPE_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(payrollEarningType.name, `%${value}%`),
        ],
      }),
    );
    const sort = sortDirection === 'desc' ? desc : asc;
    const [data, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: payrollEarningType.id,
          name: payrollEarningType.name,
          category: payrollEarningType.category,
          inUse: inUseSql,
          createdAt: payrollEarningType.createdAt,
        })
        .from(payrollEarningType)
        .where(where)
        .orderBy(sort(fieldMap[sortBy ?? 'name']), asc(payrollEarningType.id))
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(payrollEarningType).where(where),
    ]);
    return { data, total };
  }

  async createEarningType(
    actor: AttendanceActor,
    dto: CreatePayrollEarningTypeDto,
  ) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const name = dto.name.trim();
      await this.assertNameAvailable(tx, actor.organizationId, name);
      const id = randomUUID();
      await tx.insert(payrollEarningType).values({
        id,
        organizationId: actor.organizationId,
        name,
        category: dto.category,
      });
      await writeAudit(tx, actor, 'payroll.earningType.create', id, {
        name,
        category: dto.category,
      });
      return { id };
    });
  }

  async renameEarningType(
    actor: AttendanceActor,
    id: string,
    dto: RenamePayrollEarningTypeDto,
  ) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const current = await this.requireEarningType(tx, actor, id);
      const name = dto.name.trim();
      await this.assertNameAvailable(tx, actor.organizationId, name, id);
      await tx
        .update(payrollEarningType)
        .set({ name })
        .where(eq(payrollEarningType.id, id));
      await writeAudit(tx, actor, 'payroll.earningType.rename', id, {
        name: { before: current.name, after: name },
      });
      return { id };
    });
  }

  async deleteEarningType(actor: AttendanceActor, id: string) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const current = await this.requireEarningType(tx, actor, id);
      const [used] = await tx
        .select({ id: payrollEarning.id })
        .from(payrollEarning)
        .where(eq(payrollEarning.earningTypeId, id))
        .limit(1);
      if (used) throw conflictError('earningTypeInUse');
      await tx.delete(payrollEarningType).where(eq(payrollEarningType.id, id));
      await writeAudit(tx, actor, 'payroll.earningType.delete', id, {
        name: current.name,
        category: current.category,
      });
      return { id };
    });
  }

  async earnings(actor: AttendanceActor, employeeId: string, month: string) {
    return this.db
      .select({
        earningTypeId: payrollEarning.earningTypeId,
        amountCents: payrollEarning.amountCents,
      })
      .from(payrollEarning)
      .where(
        and(
          eq(payrollEarning.organizationId, actor.organizationId),
          eq(payrollEarning.employeeId, employeeId),
          eq(payrollEarning.month, month),
        ),
      )
      .orderBy(asc(payrollEarning.createdAt), asc(payrollEarning.id));
  }

  async replaceEarnings(
    tx: Transaction,
    actor: AttendanceActor,
    employeeId: string,
    month: string,
    earnings: PayrollEarningInputDto[],
  ) {
    const typeIds = [...new Set(earnings.map((item) => item.earningTypeId))];
    if (typeIds.length) {
      const [{ total }] = await tx
        .select({ total: count() })
        .from(payrollEarningType)
        .where(
          and(
            eq(payrollEarningType.organizationId, actor.organizationId),
            inArray(payrollEarningType.id, typeIds),
          ),
        );
      if (total !== typeIds.length) throw badRequestError('invalidEarningType');
    }
    await tx
      .delete(payrollEarning)
      .where(
        and(
          eq(payrollEarning.employeeId, employeeId),
          eq(payrollEarning.month, month),
        ),
      );
    if (earnings.length)
      await tx.insert(payrollEarning).values(
        earnings.map((item) => ({
          id: randomUUID(),
          organizationId: actor.organizationId,
          employeeId,
          month,
          earningTypeId: item.earningTypeId,
          amountCents: item.amountCents,
        })),
      );
  }

  private async requireEarningType(
    tx: Transaction,
    actor: AttendanceActor,
    id: string,
  ) {
    const [row] = await tx
      .select()
      .from(payrollEarningType)
      .where(
        and(
          eq(payrollEarningType.id, id),
          eq(payrollEarningType.organizationId, actor.organizationId),
        ),
      );
    if (!row) throw new NotFoundException();
    return row;
  }

  private async assertNameAvailable(
    tx: Transaction,
    organizationId: string,
    name: string,
    exceptId?: string,
  ) {
    const [taken] = await tx
      .select({ id: payrollEarningType.id })
      .from(payrollEarningType)
      .where(
        and(
          eq(payrollEarningType.organizationId, organizationId),
          eq(payrollEarningType.name, name),
          exceptId ? ne(payrollEarningType.id, exceptId) : undefined,
        ),
      )
      .limit(1);
    if (taken) throw conflictError('earningTypeNameTaken');
  }
}
