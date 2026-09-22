import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  ilike,
  inArray,
  ne,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { isAuthorized } from 'src/auth/permissions';
import { DAY_MS, platformDateString } from 'src/common/constants/timezone';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
  parseQuickFilterEnums,
} from 'src/common/utils/data-grid-filters';
import {
  STATUTORY_LEAVE_KINDS,
  attendanceEmployee,
  attendanceLeaveBalance,
  attendanceLeaveCase,
  attendanceLeaveType,
  attendanceRequest,
} from 'src/db/schema/attendance';
import { user } from 'src/db/schema/users';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import type { AttendanceActor } from './attendance-actor';
import {
  assertPayrollUnlocked,
  lockOrganization,
  writeAudit,
  type Transaction,
} from './attendance-audit';
import {
  badRequestError,
  conflictError,
  forbiddenError,
} from './attendance-errors';
import { countedRequestStatuses } from './attendance-rules';
import {
  ATTENDANCE_LEAVE_BALANCE_DATE_FILTER_FIELDS,
  ATTENDANCE_LEAVE_BALANCE_ENUM_FILTER_FIELDS,
  ATTENDANCE_LEAVE_BALANCE_NUMBER_FILTER_FIELDS,
  ATTENDANCE_LEAVE_BALANCE_STRING_FILTER_FIELDS,
  AttendanceLeaveBalancePaginationQueryDto,
} from './dto/attendance-leave-balance-pagination-query.dto';
import {
  ATTENDANCE_LEAVE_CASE_DATE_FILTER_FIELDS,
  ATTENDANCE_LEAVE_CASE_ENUM_FILTER_FIELDS,
  ATTENDANCE_LEAVE_CASE_NUMBER_FILTER_FIELDS,
  ATTENDANCE_LEAVE_CASE_STRING_FILTER_FIELDS,
  AttendanceLeaveCasePaginationQueryDto,
} from './dto/attendance-leave-case-pagination-query.dto';
import {
  ATTENDANCE_LEAVE_TYPE_BOOLEAN_FILTER_FIELDS,
  ATTENDANCE_LEAVE_TYPE_ENUM_FILTER_FIELDS,
  ATTENDANCE_LEAVE_TYPE_NUMBER_FILTER_FIELDS,
  ATTENDANCE_LEAVE_TYPE_STRING_FILTER_FIELDS,
  AttendanceLeaveTypePaginationQueryDto,
} from './dto/attendance-leave-type-pagination-query.dto';
import { CreateAttendanceLeaveCaseDto } from './dto/create-attendance-leave-case.dto';
import { SaveAttendanceLeaveBalanceDto } from './dto/save-attendance-leave-balance.dto';
import { SaveAttendanceLeaveTypeDto } from './dto/save-attendance-leave-type.dto';
import { weeklyMinutesAt, weeklyMinutesOf } from './employee-hours';
import { requireEmployee } from './employee-lookup';
import { statutoryBalance } from './leave-ledger';
import {
  anniversary,
  calendarLeaveMinutes,
  eventLeaveEntitlement,
  isCalendarLeave,
  isEventLeave,
  requiresMedicalCertificate,
  statutoryLeavePeriod,
  statutoryPaidPercent,
} from './leave-rules';
import { isMedicalLeave, loadMedicalLedgers } from './medical-leave';
import { parentalLeaveErrors } from './parental-leave';
import { matchParentalChild } from './parental-ledger';
import { parseInterval } from './shift-intervals';
import { STATUTORY_LEAVE_NAMES } from './statutory-leave-types';

interface MemoryPageOptions<Row> {
  defaultSort: (first: Row, second: Row) => number;
  stringFields: readonly string[];
  dateFields: readonly string[];
  enumFields: readonly string[];
  numberFields: readonly string[];
  textFields: readonly string[];
}

const scalarText = (value: unknown) =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : '';

const memoryStringMatch = (
  raw: unknown,
  operator: string,
  value: string,
): boolean => {
  const text = scalarText(raw);
  const target = text.toLocaleLowerCase();
  const keyword = value.toLocaleLowerCase();

  switch (operator) {
    case 'contains':
      return target.includes(keyword);
    case 'doesNotContain':
      return !target.includes(keyword);
    case 'equals':
      return text === value;
    case 'doesNotEqual':
      return text !== value;
    case 'startsWith':
      return target.startsWith(keyword);
    case 'endsWith':
      return target.endsWith(keyword);
    case 'isEmpty':
      return text === '';
    case 'isNotEmpty':
      return text !== '';
    case 'isAnyOf':
      return value.split(',').filter(Boolean).includes(text);
    default:
      return true;
  }
};

const memoryDateMatch = (
  raw: unknown,
  operator: string,
  value: string,
): boolean => {
  if (operator === 'isEmpty') return raw == null;
  if (operator === 'isNotEmpty') return raw != null;
  if (raw == null || !value) return false;

  const current = platformDateString(new Date(raw as string | Date));

  switch (operator) {
    case 'is':
      return current === value;
    case 'not':
      return current !== value;
    case 'after':
      return current > value;
    case 'onOrAfter':
      return current >= value;
    case 'before':
      return current < value;
    case 'onOrBefore':
      return current <= value;
    default:
      return true;
  }
};

const memoryNumberMatch = (
  raw: unknown,
  operator: string,
  value: string,
): boolean => {
  if (operator === 'isEmpty') return raw == null;
  if (operator === 'isNotEmpty') return raw != null;
  if (raw == null) return false;

  const current = Number(raw);

  if (operator === 'isAnyOf')
    return value
      .split(',')
      .map(Number)
      .filter((entry) => !Number.isNaN(entry))
      .includes(current);

  const target = Number(value);
  if (!value || Number.isNaN(target)) return true;

  switch (operator) {
    case '=':
      return current === target;
    case '!=':
      return current !== target;
    case '>':
      return current > target;
    case '>=':
      return current >= target;
    case '<':
      return current < target;
    case '<=':
      return current <= target;
    default:
      return true;
  }
};

const memoryEnumMatch = (
  raw: unknown,
  operator: string,
  value: string,
): boolean => {
  const current = scalarText(raw);
  if (!value) return true;

  switch (operator) {
    case 'is':
      return current === value;
    case 'not':
      return current !== value;
    case 'isAnyOf':
      return value.split(',').filter(Boolean).includes(current);
    default:
      return true;
  }
};

const compareValues = (first: unknown, second: unknown): number => {
  if (first == null && second == null) return 0;
  if (first == null) return -1;
  if (second == null) return 1;
  if (typeof first === 'number' && typeof second === 'number')
    return first - second;
  if (first instanceof Date && second instanceof Date)
    return first.getTime() - second.getTime();

  return scalarText(first).localeCompare(scalarText(second));
};

const pageInMemory = <Row extends Record<string, unknown>>(
  rows: Row[],
  query: PaginationQueryDto & { filterField?: string; sortBy?: string },
  {
    defaultSort,
    stringFields,
    dateFields,
    enumFields,
    numberFields,
    textFields,
  }: MemoryPageOptions<Row>,
) => {
  const {
    limit = 10,
    offset = 0,
    filterField,
    filterOperator,
    filterValue = '',
    quickFilterEnums,
    quickFilterValue,
    sortBy,
    sortDirection = 'asc',
  } = query;
  let filtered = rows;

  if (filterField && filterOperator) {
    const match = stringFields.includes(filterField)
      ? memoryStringMatch
      : dateFields.includes(filterField)
        ? memoryDateMatch
        : enumFields.includes(filterField)
          ? memoryEnumMatch
          : numberFields.includes(filterField)
            ? memoryNumberMatch
            : undefined;
    if (match)
      filtered = filtered.filter((row) =>
        match(row[filterField], filterOperator, filterValue),
      );
  }

  const keyword = quickFilterValue?.trim().toLocaleLowerCase();
  const enumMatches = parseQuickFilterEnums(quickFilterEnums).filter(
    ({ field }) => enumFields.includes(field),
  );
  if (keyword || enumMatches.length)
    filtered = filtered.filter(
      (row) =>
        (!!keyword &&
          textFields.some((field) =>
            scalarText(row[field]).toLocaleLowerCase().includes(keyword),
          )) ||
        enumMatches.some(({ field, value }) =>
          memoryEnumMatch(row[field], 'isAnyOf', value),
        ),
    );

  const sorted = [...filtered].sort(
    sortBy
      ? (first, second) =>
          (sortDirection === 'desc' ? -1 : 1) *
          compareValues(first[sortBy], second[sortBy])
      : defaultSort,
  );

  return { data: sorted.slice(offset, offset + limit), total: sorted.length };
};

const leaveTypeWithFlags = (row: typeof attendanceLeaveType.$inferSelect) => ({
  ...row,
  eventLeave: isEventLeave(row.statutoryKind),
  calendarLeave: isCalendarLeave(row.statutoryKind),
  medicalCertificateRequired: requiresMedicalCertificate(row.statutoryKind),
  statutoryPaidPercent:
    row.statutoryKind === 'custom'
      ? null
      : statutoryPaidPercent(row.statutoryKind),
});

const effectivePaidPercentSql = sql`coalesce(${attendanceLeaveType.paidPercent}, case ${attendanceLeaveType.statutoryKind} ${sql.join(
  STATUTORY_LEAVE_KINDS.map(
    (kind) =>
      sql`when ${kind} then ${sql.raw(String(statutoryPaidPercent(kind)))}`,
  ),
  sql` `,
)} end)`;

const statutoryLeaveKindOrderSql = sql<number>`case ${attendanceLeaveType.statutoryKind} ${sql.join(
  STATUTORY_LEAVE_KINDS.map(
    (kind, index) =>
      sql`when ${kind} then ${sql.raw(
        String(kind === 'custom' ? STATUTORY_LEAVE_KINDS.length : index),
      )}`,
  ),
  sql` `,
)} end`;

@Injectable()
export class AttendanceLeavesService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async leaveCases(
    actor: AttendanceActor,
    query: AttendanceLeaveCasePaginationQueryDto,
    mine: boolean,
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
      sortDirection = 'desc',
    } = query;
    const employeeId = mine
      ? (await requireEmployee(actor, this.db)).id
      : undefined;
    const fieldMap: Record<string, Column | SQL> = {
      employeeName: user.name,
      leaveTypeName: attendanceLeaveType.name,
      leaveTypeStatutoryKind: attendanceLeaveType.statutoryKind,
      reference: attendanceLeaveCase.reference,
      reason: attendanceLeaveCase.reason,
      eventDate: attendanceLeaveCase.eventDate,
      startsAt: attendanceLeaveCase.startsAt,
      endsAt: attendanceLeaveCase.endsAt,
      grantedMinutes: attendanceLeaveCase.grantedMinutes,
      paidPercent: attendanceLeaveCase.paidPercent,
    };
    const where = and(
      eq(attendanceLeaveCase.organizationId, actor.organizationId),
      employeeId ? eq(attendanceLeaveCase.employeeId, employeeId) : undefined,
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            ATTENDANCE_LEAVE_CASE_STRING_FILTER_FIELDS,
            ATTENDANCE_LEAVE_CASE_DATE_FILTER_FIELDS,
            ATTENDANCE_LEAVE_CASE_ENUM_FILTER_FIELDS,
            ATTENDANCE_LEAVE_CASE_NUMBER_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: ATTENDANCE_LEAVE_CASE_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(user.name, `%${value}%`),
          ilike(attendanceLeaveType.name, `%${value}%`),
          ilike(attendanceLeaveCase.reference, `%${value}%`),
          ilike(attendanceLeaveCase.reason, `%${value}%`),
          ilike(localTimeText(attendanceLeaveCase.startsAt), `%${value}%`),
          ilike(localTimeText(attendanceLeaveCase.endsAt), `%${value}%`),
        ],
      }),
    );
    const sort = sortDirection === 'asc' ? asc : desc;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: attendanceLeaveCase.id,
          employeeId: attendanceLeaveCase.employeeId,
          employeeName: user.name,
          leaveTypeId: attendanceLeaveCase.leaveTypeId,
          leaveTypeName: attendanceLeaveType.name,
          leaveTypeStatutoryKind: attendanceLeaveType.statutoryKind,
          reference: attendanceLeaveCase.reference,
          childId: attendanceLeaveCase.childId,
          eventDate: attendanceLeaveCase.eventDate,
          startsAt: attendanceLeaveCase.startsAt,
          endsAt: attendanceLeaveCase.endsAt,
          grantedMinutes: attendanceLeaveCase.grantedMinutes,
          paidPercent: attendanceLeaveCase.paidPercent,
          reason: attendanceLeaveCase.reason,
        })
        .from(attendanceLeaveCase)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceLeaveCase.employeeId),
        )
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .innerJoin(
          attendanceLeaveType,
          eq(attendanceLeaveType.id, attendanceLeaveCase.leaveTypeId),
        )
        .where(where)
        .orderBy(
          sort(sortBy ? fieldMap[sortBy] : attendanceLeaveCase.createdAt),
          asc(attendanceLeaveCase.id),
        )
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(attendanceLeaveCase)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceLeaveCase.employeeId),
        )
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .innerJoin(
          attendanceLeaveType,
          eq(attendanceLeaveType.id, attendanceLeaveCase.leaveTypeId),
        )
        .where(where),
    ]);
    if (!rows.length) return { data: [], total };
    const usage = await this.db
      .select({
        leaveCaseId: attendanceRequest.leaveCaseId,
        minutes: sql<number>`coalesce(sum(${attendanceRequest.leaveMinutes}), 0)::integer`,
      })
      .from(attendanceRequest)
      .where(
        and(
          inArray(
            attendanceRequest.leaveCaseId,
            rows.map((row) => row.id),
          ),
          inArray(attendanceRequest.status, countedRequestStatuses),
        ),
      )
      .groupBy(attendanceRequest.leaveCaseId);
    return {
      data: rows.map((row) => ({
        ...row,
        usedMinutes:
          usage.find((item) => item.leaveCaseId === row.id)?.minutes ?? 0,
      })),
      total,
    };
  }

  private async resolveLeaveCase(
    tx: Transaction,
    actor: AttendanceActor,
    dto: CreateAttendanceLeaveCaseDto,
    currentId?: string,
  ) {
    const [employee] = await tx
      .select()
      .from(attendanceEmployee)
      .where(
        and(
          eq(attendanceEmployee.id, dto.employeeId),
          eq(attendanceEmployee.organizationId, actor.organizationId),
        ),
      );
    const [policy] = await tx
      .select()
      .from(attendanceLeaveType)
      .where(
        and(
          eq(attendanceLeaveType.id, dto.leaveTypeId),
          eq(attendanceLeaveType.organizationId, actor.organizationId),
          eq(attendanceLeaveType.enabled, true),
        ),
      );
    if (!employee || !policy || !isEventLeave(policy.statutoryKind))
      throw badRequestError('invalidLeaveCase');
    if (employee.userId === actor.userId)
      throw forbiddenError('cannotReviewSelf');
    const { startsAt, endsAt } = parseInterval(dto.startsAt, dto.endsAt);
    const eventDate = new Date(dto.eventDate);
    if (
      !dto.reference.trim() ||
      !dto.reason.trim() ||
      startsAt < employee.hiredAt ||
      endsAt.getTime() - startsAt.getTime() >
        (policy.statutoryKind === 'parental' ? 3 : 2) * 366 * DAY_MS ||
      !Number.isFinite(eventDate.getTime())
    )
      throw badRequestError('invalidLeaveCase');
    if (
      policy.statutoryKind !== 'parental' &&
      isCalendarLeave(policy.statutoryKind) &&
      (!isAuthorized(actor.role, { payrollTerm: ['update'] }) ||
        !dto.dailyPayCents ||
        !/^\d{1,12}$/.test(dto.dailyPayCents))
    )
      throw badRequestError('calendarLeavePayRequired');
    if (
      policy.statutoryKind === 'parental' &&
      (eventDate > new Date() ||
        startsAt < eventDate ||
        endsAt > anniversary(eventDate, 36) ||
        (!dto.earlyParentalAgreed &&
          startsAt < anniversary(employee.hiredAt, 6)))
    )
      throw badRequestError('invalidParentalInterval');
    if (policy.statutoryKind === 'parental')
      await matchParentalChild(
        tx,
        actor.organizationId,
        employee.id,
        dto.childId,
        eventDate,
      );
    else if (dto.childId) throw badRequestError('parentalChildMismatch');
    const statutory = eventLeaveEntitlement(
      policy.statutoryKind,
      employee.hiredAt,
      startsAt,
      weeklyMinutesAt(employee, startsAt),
    );
    const entitlement = {
      ...statutory,
      paidPercent: Math.max(statutory.paidPercent, policy.paidPercent ?? 0),
    };
    if (
      policy.statutoryKind !== 'parental' &&
      isCalendarLeave(policy.statutoryKind) &&
      entitlement.paidPercent > 0 &&
      BigInt(dto.dailyPayCents!) <= 0n
    )
      throw badRequestError('calendarLeavePayRequired');
    if (
      policy.statutoryKind !== 'parental' &&
      isCalendarLeave(policy.statutoryKind) &&
      calendarLeaveMinutes(startsAt, endsAt) !== entitlement.grantedMinutes
    )
      throw badRequestError('calendarLeaveInterval');
    if (
      policy.statutoryKind === 'marriage' &&
      (startsAt.getTime() < eventDate.getTime() - 10 * DAY_MS ||
        endsAt > anniversary(eventDate, dto.extensionAgreed ? 6 : 3))
    )
      throw badRequestError('invalidLeaveCase');
    const [existing] = await tx
      .select({ id: attendanceLeaveCase.id })
      .from(attendanceLeaveCase)
      .where(
        and(
          eq(attendanceLeaveCase.employeeId, employee.id),
          eq(attendanceLeaveCase.leaveTypeId, policy.id),
          eq(attendanceLeaveCase.reference, dto.reference.trim()),
          currentId ? ne(attendanceLeaveCase.id, currentId) : undefined,
        ),
      );
    if (existing) throw conflictError('leaveCaseExists');

    return {
      employee,
      policy,
      entitlement,
      values: {
        employeeId: employee.id,
        leaveTypeId: policy.id,
        reference: dto.reference.trim(),
        childId: dto.childId ?? null,
        eventDate,
        startsAt,
        endsAt,
        ...entitlement,
        dailyPayCents:
          policy.statutoryKind === 'parental'
            ? '0'
            : isCalendarLeave(policy.statutoryKind)
              ? dto.dailyPayCents
              : null,
        reason: dto.reason.trim(),
      },
    };
  }

  async createLeaveCase(
    actor: AttendanceActor,
    dto: CreateAttendanceLeaveCaseDto,
  ) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const { entitlement, values } = await this.resolveLeaveCase(
        tx,
        actor,
        dto,
      );
      const [row] = await tx
        .insert(attendanceLeaveCase)
        .values({
          id: randomUUID(),
          organizationId: actor.organizationId,
          createdBy: actor.userId,
          ...values,
        })
        .returning();
      await writeAudit(tx, actor, 'leaveCase.create', row.id, {
        ...dto,
        ...entitlement,
      });
      return row;
    });
  }

  async updateLeaveCase(
    actor: AttendanceActor,
    id: string,
    dto: CreateAttendanceLeaveCaseDto,
  ) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [current] = await tx
        .select()
        .from(attendanceLeaveCase)
        .where(
          and(
            eq(attendanceLeaveCase.id, id),
            eq(attendanceLeaveCase.organizationId, actor.organizationId),
          ),
        );
      if (!current) throw new NotFoundException();
      const { policy, values } = await this.resolveLeaveCase(
        tx,
        actor,
        dto,
        id,
      );
      // 換人或換假別等於另一筆案件，既有請假單會跟著錯人錯假別
      if (
        current.employeeId !== values.employeeId ||
        current.leaveTypeId !== values.leaveTypeId
      )
        throw badRequestError('invalidLeaveCase');
      const requests = await tx
        .select()
        .from(attendanceRequest)
        .where(
          and(
            eq(attendanceRequest.leaveCaseId, id),
            inArray(attendanceRequest.status, countedRequestStatuses),
          ),
        );
      const usedMinutes = requests.reduce(
        (total, request) => total + (request.leaveMinutes ?? 0),
        0,
      );
      if (usedMinutes > values.grantedMinutes)
        throw conflictError('insufficientLeaveBalance');
      if (
        requests.some(
          ({ endsAt, startsAt }) =>
            startsAt < values.startsAt || endsAt > values.endsAt,
        )
      )
        throw conflictError('leaveCaseIntervalConflict');
      for (const [from, to] of [
        [current.startsAt, current.endsAt],
        [values.startsAt, values.endsAt],
      ])
        await assertPayrollUnlocked(
          tx,
          actor.organizationId,
          current.employeeId,
          from,
          to,
        );
      const [row] = await tx
        .update(attendanceLeaveCase)
        .set(values)
        .where(eq(attendanceLeaveCase.id, id))
        .returning();
      if (policy.statutoryKind === 'parental') {
        const cases = await tx
          .select()
          .from(attendanceLeaveCase)
          .where(
            and(
              eq(attendanceLeaveCase.organizationId, actor.organizationId),
              eq(attendanceLeaveCase.employeeId, current.employeeId),
              eq(attendanceLeaveCase.leaveTypeId, current.leaveTypeId),
            ),
          );
        const records = await tx
          .select()
          .from(attendanceRequest)
          .where(
            and(
              eq(attendanceRequest.organizationId, actor.organizationId),
              eq(attendanceRequest.employeeId, current.employeeId),
              eq(attendanceRequest.leaveTypeId, current.leaveTypeId),
              inArray(attendanceRequest.status, countedRequestStatuses),
            ),
          );
        const errors = parentalLeaveErrors(
          records.map((item) => ({ ...item, leaveCaseId: item.leaveCaseId! })),
          cases,
        );
        if (errors.length) throw conflictError(errors[0]);
      }
      await writeAudit(tx, actor, 'leaveCase.update', id, {
        ...dto,
        grantedMinutes: values.grantedMinutes,
        paidPercent: values.paidPercent,
      });
      return row;
    });
  }

  async deleteLeaveCase(actor: AttendanceActor, id: string) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [row] = await tx
        .select({
          leaveCase: attendanceLeaveCase,
          employee: attendanceEmployee,
        })
        .from(attendanceLeaveCase)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceLeaveCase.employeeId),
        )
        .where(
          and(
            eq(attendanceLeaveCase.id, id),
            eq(attendanceLeaveCase.organizationId, actor.organizationId),
          ),
        );
      if (!row) throw new NotFoundException();
      if (row.employee.userId === actor.userId)
        throw forbiddenError('cannotReviewSelf');
      // 任何狀態的請假單都以外鍵指向案件，撤回與駁回的也會讓刪除失敗
      const [referenced] = await tx
        .select({ id: attendanceRequest.id })
        .from(attendanceRequest)
        .where(eq(attendanceRequest.leaveCaseId, id))
        .limit(1);
      if (referenced) throw conflictError('leaveCaseInUse');
      await assertPayrollUnlocked(
        tx,
        actor.organizationId,
        row.leaveCase.employeeId,
        row.leaveCase.startsAt,
        row.leaveCase.endsAt,
      );
      await tx
        .delete(attendanceLeaveCase)
        .where(eq(attendanceLeaveCase.id, id));
      await writeAudit(tx, actor, 'leaveCase.delete', id, {
        reference: row.leaveCase.reference,
        startsAt: row.leaveCase.startsAt,
        endsAt: row.leaveCase.endsAt,
        grantedMinutes: row.leaveCase.grantedMinutes,
      });
      return { id };
    });
  }

  async leaveTypes(
    actor: AttendanceActor,
    query: AttendanceLeaveTypePaginationQueryDto,
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
      sortDirection = 'desc',
    } = query;
    const fieldMap: Record<string, Column | SQL> = {
      name: attendanceLeaveType.name,
      statutoryKind: attendanceLeaveType.statutoryKind,
      paidPercent: effectivePaidPercentSql,
      requiresBalance: attendanceLeaveType.requiresBalance,
      enabled: attendanceLeaveType.enabled,
    };
    const sortFieldMap: Record<string, Column | SQL> = {
      ...fieldMap,
      statutoryKind: statutoryLeaveKindOrderSql,
    };
    const where = and(
      eq(attendanceLeaveType.organizationId, actor.organizationId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            ATTENDANCE_LEAVE_TYPE_STRING_FILTER_FIELDS,
            [],
            ATTENDANCE_LEAVE_TYPE_ENUM_FILTER_FIELDS,
            ATTENDANCE_LEAVE_TYPE_NUMBER_FILTER_FIELDS,
            [],
            [],
            ATTENDANCE_LEAVE_TYPE_BOOLEAN_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: ATTENDANCE_LEAVE_TYPE_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(attendanceLeaveType.name, `%${value}%`),
        ],
      }),
    );
    const sort = sortDirection === 'desc' ? desc : asc;
    const [data, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(attendanceLeaveType)
        .where(where)
        .orderBy(
          sort(sortBy ? sortFieldMap[sortBy] : statutoryLeaveKindOrderSql),
          sort(attendanceLeaveType.createdAt),
          asc(attendanceLeaveType.id),
        )
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(attendanceLeaveType).where(where),
    ]);
    return { data: data.map(leaveTypeWithFlags), total };
  }

  async saveLeaveType(
    actor: AttendanceActor,
    dto: SaveAttendanceLeaveTypeDto,
    id?: string,
  ) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [current] = id
        ? await tx
            .select()
            .from(attendanceLeaveType)
            .where(
              and(
                eq(attendanceLeaveType.id, id),
                eq(attendanceLeaveType.organizationId, actor.organizationId),
              ),
            )
        : [];
      if (id && !current) throw new NotFoundException();
      const statutoryKind = current?.statutoryKind ?? 'custom';
      if (statutoryKind === 'custom' && dto.paidPercent == null)
        throw badRequestError('leavePolicyRulesRequired');
      const values =
        statutoryKind === 'custom'
          ? {
              name: dto.name,
              paidPercent: dto.paidPercent ?? null,
              requiresBalance: dto.requiresBalance ?? true,
              enabled: dto.enabled,
            }
          : {
              // 法定假別的名稱來自法規，不能被表單改掉
              name: STATUTORY_LEAVE_NAMES[statutoryKind],
              // 與法定比例相同不算優於法令，存 null 才不會被標成優於法規
              paidPercent:
                dto.paidPercent === statutoryPaidPercent(statutoryKind)
                  ? null
                  : (dto.paidPercent ?? null),
              requiresBalance: null,
              enabled: true,
            };
      if (
        values.paidPercent !== null &&
        values.paidPercent < statutoryPaidPercent(statutoryKind)
      )
        throw badRequestError('belowStatutoryPaidPercent');
      const [row] = id
        ? await tx
            .update(attendanceLeaveType)
            .set(values)
            .where(eq(attendanceLeaveType.id, id))
            .returning()
        : await tx
            .insert(attendanceLeaveType)
            .values({
              id: randomUUID(),
              organizationId: actor.organizationId,
              ...values,
            })
            .returning();
      await writeAudit(
        tx,
        actor,
        id ? 'leaveType.update' : 'leaveType.create',
        row.id,
        { ...dto },
      );
      return leaveTypeWithFlags(row);
    });
  }

  async deleteLeaveType(actor: AttendanceActor, id: string) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [row] = await tx
        .select()
        .from(attendanceLeaveType)
        .where(
          and(
            eq(attendanceLeaveType.id, id),
            eq(attendanceLeaveType.organizationId, actor.organizationId),
          ),
        );
      if (!row) throw new NotFoundException();
      if (row.statutoryKind !== 'custom')
        throw conflictError('statutoryLeaveTypeLocked');
      const [request] = await tx
        .select({ id: attendanceRequest.id })
        .from(attendanceRequest)
        .where(eq(attendanceRequest.leaveTypeId, id))
        .limit(1);
      const [leaveCase] = await tx
        .select({ id: attendanceLeaveCase.id })
        .from(attendanceLeaveCase)
        .where(eq(attendanceLeaveCase.leaveTypeId, id))
        .limit(1);
      const [used] = await tx
        .select({ id: attendanceLeaveBalance.id })
        .from(attendanceLeaveBalance)
        .where(
          and(
            eq(attendanceLeaveBalance.leaveTypeId, id),
            gt(attendanceLeaveBalance.usedMinutes, 0),
          ),
        )
        .limit(1);
      if (request || leaveCase || used) throw conflictError('leaveTypeInUse');
      await tx
        .delete(attendanceLeaveBalance)
        .where(eq(attendanceLeaveBalance.leaveTypeId, id));
      await tx
        .delete(attendanceLeaveType)
        .where(eq(attendanceLeaveType.id, id));
      await writeAudit(tx, actor, 'leaveType.delete', id, {
        name: row.name,
        paidPercent: row.paidPercent,
        requiresBalance: row.requiresBalance,
        enabled: row.enabled,
      });
      return { id };
    });
  }

  async leaveBalances(
    actor: AttendanceActor,
    query: AttendanceLeaveBalancePaginationQueryDto,
    mine: boolean,
  ) {
    const employeeId = mine
      ? (await requireEmployee(actor, this.db)).id
      : undefined;
    const rows = await this.db.transaction(async (tx) => {
      const balances = await tx
        .select()
        .from(attendanceLeaveBalance)
        .where(
          and(
            eq(attendanceLeaveBalance.organizationId, actor.organizationId),
            employeeId
              ? eq(attendanceLeaveBalance.employeeId, employeeId)
              : undefined,
          ),
        );
      const employees = await tx
        .select({ ...getTableColumns(attendanceEmployee), name: user.name })
        .from(attendanceEmployee)
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(
          and(
            eq(attendanceEmployee.organizationId, actor.organizationId),
            employeeId ? eq(attendanceEmployee.id, employeeId) : undefined,
          ),
        );
      const policies = await tx
        .select()
        .from(attendanceLeaveType)
        .where(eq(attendanceLeaveType.organizationId, actor.organizationId));
      const statutoryPolicies = policies.filter(
        (policy) => policy.statutoryKind !== 'custom',
      );
      const ledgerPolicy = (policy: (typeof statutoryPolicies)[number]) =>
        isMedicalLeave(policy.statutoryKind) &&
        policy.statutoryKind !== 'menstrual';
      const at = new Date();
      const periodStarts = employees.flatMap((employee) =>
        statutoryPolicies
          .filter((policy) => !ledgerPolicy(policy))
          .flatMap(
            (policy) =>
              statutoryLeavePeriod(
                policy.statutoryKind,
                employee.hiredAt,
                at,
                weeklyMinutesOf(employee),
              )?.start.getTime() ?? [],
          ),
      );
      const leaveRecords = periodStarts.length
        ? await tx
            .select()
            .from(attendanceRequest)
            .where(
              and(
                eq(attendanceRequest.organizationId, actor.organizationId),
                inArray(
                  attendanceRequest.employeeId,
                  employees.map((employee) => employee.id),
                ),
                eq(attendanceRequest.kind, 'leave'),
                inArray(attendanceRequest.status, countedRequestStatuses),
                sql`${attendanceRequest.startsAt} >= ${new Date(Math.min(...periodStarts))}`,
              ),
            )
            .orderBy(asc(attendanceRequest.startsAt))
        : [];
      const recordsOf = new Map<string, typeof leaveRecords>();
      for (const record of leaveRecords) {
        const own = recordsOf.get(record.employeeId) ?? [];
        own.push(record);
        recordsOf.set(record.employeeId, own);
      }
      const ledgers = statutoryPolicies.some(ledgerPolicy)
        ? await loadMedicalLedgers(tx, employees)
        : undefined;
      const statutory = [];
      for (const employee of employees) {
        const preloaded = {
          policies,
          ledger: ledgers?.get(employee.id),
          records: recordsOf.get(employee.id) ?? [],
        };
        for (const policy of statutoryPolicies) {
          const balance = await statutoryBalance(
            tx,
            employee,
            policy,
            at,
            preloaded,
          );
          if (balance) statutory.push(balance);
        }
      }
      const named = (balance: { employeeId: string; leaveTypeId: string }) => ({
        employeeName:
          employees.find((employee) => employee.id === balance.employeeId)
            ?.name ?? '',
        leaveTypeName:
          policies.find((policy) => policy.id === balance.leaveTypeId)?.name ??
          '',
        leaveTypeStatutoryKind:
          policies.find((policy) => policy.id === balance.leaveTypeId)
            ?.statutoryKind ?? 'custom',
      });
      return [
        ...balances.map((balance) => ({
          ...balance,
          ...named(balance),
          statutory: false,
          startsAt: null as Date | null,
          endsAt: null as Date | null,
        })),
        ...statutory.map((balance) => ({ ...balance, ...named(balance) })),
      ];
    });
    return pageInMemory(rows, query, {
      defaultSort: (first, second) =>
        first.employeeName.localeCompare(second.employeeName) ||
        first.leaveTypeName.localeCompare(second.leaveTypeName),
      stringFields: ATTENDANCE_LEAVE_BALANCE_STRING_FILTER_FIELDS,
      dateFields: ATTENDANCE_LEAVE_BALANCE_DATE_FILTER_FIELDS,
      enumFields: ATTENDANCE_LEAVE_BALANCE_ENUM_FILTER_FIELDS,
      numberFields: ATTENDANCE_LEAVE_BALANCE_NUMBER_FILTER_FIELDS,
      textFields: ['employeeName', 'leaveTypeName'],
    });
  }

  async saveLeaveBalance(
    actor: AttendanceActor,
    dto: SaveAttendanceLeaveBalanceDto,
  ) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [employee] = await tx
        .select()
        .from(attendanceEmployee)
        .where(
          and(
            eq(attendanceEmployee.id, dto.employeeId),
            eq(attendanceEmployee.organizationId, actor.organizationId),
          ),
        );
      const [policy] = await tx
        .select()
        .from(attendanceLeaveType)
        .where(
          and(
            eq(attendanceLeaveType.id, dto.leaveTypeId),
            eq(attendanceLeaveType.organizationId, actor.organizationId),
          ),
        );
      if (!employee || !policy) throw new NotFoundException();
      if (policy.statutoryKind !== 'custom')
        throw badRequestError('statutoryBalanceAutomatic');
      const [previous] = await tx
        .select()
        .from(attendanceLeaveBalance)
        .where(
          and(
            eq(attendanceLeaveBalance.employeeId, dto.employeeId),
            eq(attendanceLeaveBalance.leaveTypeId, dto.leaveTypeId),
            eq(attendanceLeaveBalance.year, dto.year),
          ),
        );
      if (previous && dto.grantedMinutes < previous.usedMinutes)
        throw conflictError('insufficientLeaveBalance');
      const [row] = await tx
        .insert(attendanceLeaveBalance)
        .values({
          id: randomUUID(),
          organizationId: actor.organizationId,
          ...dto,
        })
        .onConflictDoUpdate({
          target: [
            attendanceLeaveBalance.employeeId,
            attendanceLeaveBalance.leaveTypeId,
            attendanceLeaveBalance.year,
          ],
          set: { grantedMinutes: dto.grantedMinutes },
        })
        .returning();
      await writeAudit(tx, actor, 'leaveBalance.update', row.id, {
        ...dto,
        previous: previous?.grantedMinutes,
      });
      return row;
    });
  }
}
