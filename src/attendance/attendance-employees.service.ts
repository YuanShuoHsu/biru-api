import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  ne,
  or,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { startDeletedRecordBatch } from '../deleted-records/request-batch.js';
import { isAuthorized } from '../auth/permissions.js';
import {
  DAY_MS,
  platformDateString,
  platformMidnight,
  STORE_UTC_OFFSET,
} from '../common/constants/timezone.js';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from '../common/utils/data-grid-filters.js';
import {
  ATTENDANCE_LEGAL_STATUSES,
  attendanceEmployee,
  attendanceHolidaySubstitute,
  attendanceLeaveCase,
  attendanceLeaveType,
  attendanceParentalChild,
  attendanceRequest,
  attendanceSettings,
  attendanceShift,
  statutoryHoliday,
  type AttendanceEmploymentType,
} from '../db/schema/attendance.js';
import { member } from '../db/schema/organizations.js';
import { payrollStatement } from '../db/schema/payroll.js';
import { user } from '../db/schema/users.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import { currentOccupationalIndustryRates } from '../payroll/payroll-rules.service.js';
import { legalStatusObligations } from '../payroll/taiwan-rules.js';

import type { AttendanceActor } from './attendance-actor.js';
import {
  assertPayrollUnlocked,
  auditChanges,
  lockOrganization,
  writeAudit,
  type Transaction,
  type RestoredRecord,
} from './attendance-audit.js';
import { badRequestError, conflictError } from './attendance-errors.js';
import {
  ageOn,
  hasOverlappingOvertimeExtensions,
  INDIGENOUS_HOLIDAYS_PER_YEAR,
  intervalWithinPeriods,
  maternalNightWork,
  maternalProtectionPeriods,
  MINIMUM_WORKING_AGE,
  normalizeIpRange,
  NOTICE_TERMINATION_REASONS,
  restDayDesignationConflict,
  scheduledWorkIntervals,
  workPermitRequired,
} from './attendance-rules.js';
import {
  ATTENDANCE_EMPLOYEE_DATE_FILTER_FIELDS,
  ATTENDANCE_EMPLOYEE_ENUM_FILTER_FIELDS,
  ATTENDANCE_EMPLOYEE_STRING_FILTER_FIELDS,
  AttendanceEmployeePaginationQueryDto,
} from './dto/attendance-employee-pagination-query.dto.js';
import { SaveAttendanceEmployeeDto } from './dto/save-attendance-employee.dto.js';
import { SaveAttendanceSettingsDto } from './dto/save-attendance-settings.dto.js';
import {
  employmentType,
  employmentTypeSql,
  loadOneEmployeeHours,
  weeklyMinutesAt,
} from './employee-hours.js';
import { findEmployee } from './employee-lookup.js';
import { anniversary } from './leave-rules.js';
import { shiftStartDate } from './shift-queries.js';
import {
  employeeStatus,
  employeeStatusOrderSql,
  employeeStatusSql,
} from './employee-status.js';
import { selfReviewAllowance } from './review-separation.js';
import {
  workPermitDaysLeftSql,
  workPermitOrderSql,
  workPermitStatusSql,
} from './work-permit-status.js';

// 這兩個欄位對使用者是日期，存成非午夜的時刻會讓同一天的班次前後段套到不同工時
const platformDayStart = (value: string) =>
  new Date(platformMidnight(new Date(value).getTime()));

const currentEmploymentType = async (
  db: DrizzleDB | Transaction,
  employee: { id: string; hiredAt: Date },
) =>
  employmentType(
    weeklyMinutesAt(await loadOneEmployeeHours(db, employee), new Date()),
  );

// 刪除時仍以外鍵為準；這裡只決定是否顯示刪除按鈕
const employeeDeletableSql = sql<boolean>`${attendanceEmployee.id} IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM attendance_shift WHERE employee_id = ${attendanceEmployee.id}
  UNION ALL SELECT 1 FROM attendance_request WHERE employee_id = ${attendanceEmployee.id}
  UNION ALL SELECT 1 FROM attendance_leave_balance WHERE employee_id = ${attendanceEmployee.id}
  UNION ALL SELECT 1 FROM attendance_leave_case WHERE employee_id = ${attendanceEmployee.id}
  UNION ALL SELECT 1 FROM attendance_annual_leave_deferral WHERE employee_id = ${attendanceEmployee.id}
  UNION ALL SELECT 1 FROM attendance_annual_leave_notice WHERE employee_id = ${attendanceEmployee.id}
  UNION ALL SELECT 1 FROM attendance_parental_child WHERE employee_id = ${attendanceEmployee.id}
  UNION ALL SELECT 1 FROM payroll_terms WHERE employee_id = ${attendanceEmployee.id}
  UNION ALL SELECT 1 FROM payroll_earning WHERE employee_id = ${attendanceEmployee.id}
  UNION ALL SELECT 1 FROM payroll_tax_identity WHERE employee_id = ${attendanceEmployee.id}
  UNION ALL SELECT 1 FROM payroll_certificate_request WHERE employee_id = ${attendanceEmployee.id}
)`;

const isForeignKeyViolation = (error: unknown): boolean =>
  (error as { code?: string } | null)?.code === '23503' ||
  (error instanceof Error &&
    !!error.cause &&
    isForeignKeyViolation(error.cause));

@Injectable()
export class AttendanceEmployeesService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async context(actor: AttendanceActor) {
    const employee = await findEmployee(actor, this.db);
    return {
      employee: employee
        ? {
            ...employee,
            ...legalStatusObligations(employee.legalStatus),
            employmentType: await currentEmploymentType(this.db, employee),
            status: employeeStatus(employee),
          }
        : null,
      canManage: isAuthorized(actor.role, {
        attendanceRequest: ['read', 'update'],
        employee: ['create', 'read', 'update'],
        leaveBalance: ['create', 'update', 'read'],
        leaveCase: ['create', 'update', 'read'],
        parentalChild: ['create', 'read'],
        parentalReturn: ['read', 'update'],
        shift: ['create', 'update', 'read'],
      }),
      canManageSettings: isAuthorized(actor.role, {
        attendanceSetting: ['read', 'update'],
        leaveType: ['create', 'update'],
      }),
      canManagePayroll: isAuthorized(actor.role, {
        payrollTerm: ['create', 'update', 'read'],
        payslip: ['create', 'update', 'read'],
      }),
      selfReviewAllowed: await selfReviewAllowance(this.db, actor),
    };
  }

  legalStatusObligations() {
    return ATTENDANCE_LEGAL_STATUSES.map((legalStatus) => ({
      legalStatus,
      ...legalStatusObligations(legalStatus),
    }));
  }

  occupationalIndustries() {
    return currentOccupationalIndustryRates(this.db);
  }

  async employees(
    actor: AttendanceActor,
    query: AttendanceEmployeePaginationQueryDto,
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
      name: user.name,
      email: user.email,
      hiredAt: attendanceEmployee.hiredAt,
      terminatedAt: attendanceEmployee.terminatedAt,
      status: employeeStatusSql,
      employmentType: employmentTypeSql,
      legalStatus: attendanceEmployee.legalStatus,
      workPermitStatus: workPermitStatusSql,
    };
    const where = and(
      eq(attendanceEmployee.organizationId, actor.organizationId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            ATTENDANCE_EMPLOYEE_STRING_FILTER_FIELDS,
            ATTENDANCE_EMPLOYEE_DATE_FILTER_FIELDS,
            ATTENDANCE_EMPLOYEE_ENUM_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: ATTENDANCE_EMPLOYEE_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(user.name, `%${value}%`),
          ilike(user.email, `%${value}%`),
          ilike(localTimeText(attendanceEmployee.hiredAt), `%${value}%`),
          ilike(localTimeText(attendanceEmployee.terminatedAt), `%${value}%`),
        ],
      }),
    );
    const sort = sortDirection === 'desc' ? desc : asc;
    const sortColumn =
      sortBy === 'status'
        ? employeeStatusOrderSql
        : sortBy === 'workPermitStatus'
          ? workPermitOrderSql
          : (fieldMap[sortBy ?? ''] ?? user.name);
    const [data, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: attendanceEmployee.id,
          name: user.name,
          email: user.email,
          employmentType: sql<AttendanceEmploymentType>`${employmentTypeSql}`,
          legalStatus: attendanceEmployee.legalStatus,
          regularLeaveWeekday: attendanceEmployee.regularLeaveWeekday,
          status: employeeStatusSql,
        })
        .from(attendanceEmployee)
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(where)
        .orderBy(sort(sortColumn), asc(attendanceEmployee.id))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(attendanceEmployee)
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(where),
    ]);
    return {
      data: data.map(({ legalStatus, ...row }) => {
        const { employmentInsuranceEligible, pensionApplicable } =
          legalStatusObligations(legalStatus);
        return { ...row, employmentInsuranceEligible, pensionApplicable };
      }),
      total,
    };
  }

  async members(
    actor: AttendanceActor,
    query: AttendanceEmployeePaginationQueryDto,
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
      name: user.name,
      email: user.email,
      hiredAt: attendanceEmployee.hiredAt,
      terminatedAt: attendanceEmployee.terminatedAt,
      status: employeeStatusSql,
      employmentType: employmentTypeSql,
      legalStatus: attendanceEmployee.legalStatus,
      workPermitStatus: workPermitStatusSql,
    };
    const where = and(
      eq(member.organizationId, actor.organizationId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            ATTENDANCE_EMPLOYEE_STRING_FILTER_FIELDS,
            ATTENDANCE_EMPLOYEE_DATE_FILTER_FIELDS,
            ATTENDANCE_EMPLOYEE_ENUM_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: ATTENDANCE_EMPLOYEE_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(user.name, `%${value}%`),
          ilike(user.email, `%${value}%`),
          ilike(localTimeText(attendanceEmployee.hiredAt), `%${value}%`),
          ilike(localTimeText(attendanceEmployee.terminatedAt), `%${value}%`),
        ],
      }),
    );
    const sort = sortDirection === 'desc' ? desc : asc;
    const sortColumn =
      sortBy === 'status'
        ? employeeStatusOrderSql
        : sortBy === 'workPermitStatus'
          ? workPermitOrderSql
          : (fieldMap[sortBy ?? ''] ?? user.name);
    const [data, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: attendanceEmployee.id,
          userId: member.userId,
          name: user.name,
          email: user.email,
          joinedAt: member.createdAt,
          deletable: employeeDeletableSql,
          employmentType: employmentTypeSql,
          legalStatus: attendanceEmployee.legalStatus,
          workPermits: attendanceEmployee.workPermits,
          hiredAt: attendanceEmployee.hiredAt,
          terminatedAt: attendanceEmployee.terminatedAt,
          status: employeeStatusSql,
          workPermitStatus: workPermitStatusSql,
          workPermitDaysLeft: workPermitDaysLeftSql,
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .leftJoin(
          attendanceEmployee,
          and(
            eq(attendanceEmployee.organizationId, member.organizationId),
            eq(attendanceEmployee.userId, member.userId),
          ),
        )
        .where(where)
        .orderBy(sort(sortColumn), asc(member.id))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .leftJoin(
          attendanceEmployee,
          and(
            eq(attendanceEmployee.organizationId, member.organizationId),
            eq(attendanceEmployee.userId, member.userId),
          ),
        )
        .where(where),
    ]);
    return {
      data: data.map(
        ({
          deletable,
          email,
          employmentType,
          hiredAt,
          id,
          joinedAt,
          legalStatus,
          name,
          status,
          terminatedAt,
          userId,
          workPermitDaysLeft,
          workPermitStatus,
          workPermits,
        }) => ({
          deletable,
          email,
          joinedAt,
          name,
          status,
          userId,
          workPermitDaysLeft,
          workPermitStatus,
          employee:
            id === null ||
            hiredAt === null ||
            employmentType === null ||
            legalStatus === null ||
            workPermits === null
              ? null
              : {
                  id,
                  employmentType,
                  legalStatus,
                  workPermits,
                  ...legalStatusObligations(legalStatus),
                  hiredAt,
                  terminatedAt,
                },
        }),
      ),
      total,
    };
  }

  async employee(actor: AttendanceActor, id: string) {
    const [employee] = await this.db
      .select({
        ...getTableColumns(attendanceEmployee),
        name: user.name,
        email: user.email,
      })
      .from(attendanceEmployee)
      .innerJoin(user, eq(user.id, attendanceEmployee.userId))
      .where(
        and(
          eq(attendanceEmployee.id, id),
          eq(attendanceEmployee.organizationId, actor.organizationId),
        ),
      );
    if (!employee) throw new NotFoundException();
    return {
      ...employee,
      ...legalStatusObligations(employee.legalStatus),
      employmentType: await currentEmploymentType(this.db, employee),
      status: employeeStatus(employee),
    };
  }

  async saveEmployee(
    actor: AttendanceActor,
    dto: SaveAttendanceEmployeeDto,
    restored?: RestoredRecord,
  ) {
    return (restored?.tx ?? this.db).transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [membership] = await tx
        .select({ email: user.email, name: user.name })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(
          and(
            eq(member.organizationId, actor.organizationId),
            eq(member.userId, dto.userId),
          ),
        );
      if (!membership) throw badRequestError('memberNotFound');
      const hiredAt = platformDayStart(dto.hiredAt);
      const terminatedAt = dto.terminatedAt
        ? platformDayStart(dto.terminatedAt)
        : null;
      if (terminatedAt && terminatedAt <= hiredAt)
        throw badRequestError('invalidInterval');
      if (
        ageOn(dto.birthDate, platformDateString(hiredAt)) < MINIMUM_WORKING_AGE
      )
        throw badRequestError('belowMinimumWorkingAge');
      if (
        [
          ...dto.studentVacations,
          ...dto.workPermits,
          ...dto.pregnancyPeriods,
          ...dto.nursingPeriods,
          ...dto.childcareReductionPeriods,
        ].some(({ from, to }) => from > to)
      )
        throw badRequestError('invalidInterval');
      if (dto.childcareReductionPeriods.length) {
        const children = await tx
          .select({ birthDate: attendanceParentalChild.birthDate })
          .from(attendanceParentalChild)
          .innerJoin(
            attendanceEmployee,
            eq(attendanceEmployee.id, attendanceParentalChild.employeeId),
          )
          .where(
            and(
              eq(attendanceEmployee.organizationId, actor.organizationId),
              eq(attendanceEmployee.userId, dto.userId),
            ),
          );
        if (
          dto.childcareReductionPeriods.some(
            ({ from, to }) =>
              from < platformDateString(hiredAt) ||
              !children.some(
                ({ birthDate }) =>
                  platformDateString(birthDate) <= from &&
                  to < platformDateString(anniversary(birthDate, 36)),
              ),
          )
        )
          throw badRequestError('childcareReductionInvalid');
      }
      const indigenousHolidays = [...new Set(dto.indigenousHolidays)].sort();
      const statutoryConflict = indigenousHolidays.length
        ? await tx
            .select({ date: statutoryHoliday.date })
            .from(statutoryHoliday)
            .where(inArray(statutoryHoliday.date, indigenousHolidays))
            .limit(1)
        : [];
      if (
        indigenousHolidays.length !== dto.indigenousHolidays.length ||
        statutoryConflict.length ||
        indigenousHolidays.some(
          (date) =>
            date < platformDateString(hiredAt) ||
            (terminatedAt && date >= platformDateString(terminatedAt)) ||
            indigenousHolidays.filter((other) =>
              other.startsWith(date.slice(0, 4)),
            ).length > INDIGENOUS_HOLIDAYS_PER_YEAR,
        )
      )
        throw badRequestError('indigenousHolidayInvalid');
      const restWeekdays = {
        regularLeaveWeekday: dto.regularLeaveWeekday ?? null,
        restDayWeekday: dto.restDayWeekday ?? null,
      };
      if (
        (restWeekdays.regularLeaveWeekday === null) !==
          (restWeekdays.restDayWeekday === null) ||
        (restWeekdays.regularLeaveWeekday !== null &&
          restWeekdays.regularLeaveWeekday === restWeekdays.restDayWeekday)
      )
        throw badRequestError('restDayDesignationConflict');
      if (!!terminatedAt !== !!dto.terminationReason)
        throw badRequestError('terminationReasonRequired');
      const terminationNoticedAt = dto.terminationNoticedAt
        ? platformDayStart(dto.terminationNoticedAt)
        : null;
      if (
        terminationNoticedAt &&
        (!terminatedAt ||
          !NOTICE_TERMINATION_REASONS.includes(dto.terminationReason!) ||
          terminationNoticedAt < hiredAt ||
          terminationNoticedAt > terminatedAt)
      )
        throw badRequestError('invalidInterval');
      const [current] = await tx
        .select()
        .from(attendanceEmployee)
        .where(
          and(
            eq(attendanceEmployee.organizationId, actor.organizationId),
            eq(attendanceEmployee.userId, dto.userId),
          ),
        );
      if (current) {
        const outsideWindow = (startsAt: Column, endsAt: Column) =>
          or(
            lt(startsAt, hiredAt),
            terminatedAt ? sql`${endsAt} > ${terminatedAt}` : undefined,
          );
        const [outsideShift] = await tx
          .select({ id: attendanceShift.id })
          .from(attendanceShift)
          .where(
            and(
              eq(attendanceShift.employeeId, current.id),
              ne(attendanceShift.status, 'cancelled'),
              outsideWindow(attendanceShift.startsAt, attendanceShift.endsAt),
            ),
          )
          .limit(1);
        const [outsideRequest] = await tx
          .select({ id: attendanceRequest.id })
          .from(attendanceRequest)
          .where(
            and(
              eq(attendanceRequest.employeeId, current.id),
              inArray(attendanceRequest.status, [
                'pending',
                'approved',
                'cancellationPending',
              ]),
              outsideWindow(
                attendanceRequest.startsAt,
                attendanceRequest.endsAt,
              ),
            ),
          )
          .limit(1);
        const [outsideCase] = await tx
          .select({ id: attendanceLeaveCase.id })
          .from(attendanceLeaveCase)
          .where(
            and(
              eq(attendanceLeaveCase.employeeId, current.id),
              outsideWindow(
                attendanceLeaveCase.startsAt,
                attendanceLeaveCase.endsAt,
              ),
            ),
          )
          .limit(1);
        if (outsideShift || outsideRequest || outsideCase)
          throw conflictError('employmentWindowConflict');
        if (
          terminatedAt &&
          (dto.terminationReason === 'layoff' ||
            dto.terminationReason === 'reorganization')
        ) {
          const [protectedCase] = await tx
            .select({ id: attendanceLeaveCase.id })
            .from(attendanceLeaveCase)
            .innerJoin(
              attendanceLeaveType,
              eq(attendanceLeaveType.id, attendanceLeaveCase.leaveTypeId),
            )
            .where(
              and(
                eq(attendanceLeaveCase.employeeId, current.id),
                inArray(attendanceLeaveType.statutoryKind, [
                  'maternity',
                  'miscarriage28',
                  'occupationalInjury',
                ]),
                lt(attendanceLeaveCase.startsAt, terminatedAt),
                gt(attendanceLeaveCase.endsAt, terminatedAt),
              ),
            )
            .limit(1);
          if (protectedCase) throw conflictError('terminationProtected');
        }
        if (restWeekdays.regularLeaveWeekday !== null) {
          const upcoming = await tx
            .select({
              startsAt: attendanceShift.startsAt,
              dayKind: attendanceShift.dayKind,
            })
            .from(attendanceShift)
            .where(
              and(
                eq(attendanceShift.employeeId, current.id),
                ne(attendanceShift.status, 'cancelled'),
                gt(attendanceShift.endsAt, new Date()),
              ),
            );
          if (
            upcoming.some(
              (shift) =>
                shift.dayKind !== 'holiday' &&
                restDayDesignationConflict(
                  restWeekdays,
                  platformDateString(shift.startsAt),
                  shift.dayKind,
                ),
            )
          )
            throw conflictError('restDayDesignationConflict');
        }
        const protectedPeriods = maternalProtectionPeriods(dto);
        if (protectedPeriods.length) {
          const nightShifts = await tx
            .select()
            .from(attendanceShift)
            .where(
              and(
                eq(attendanceShift.employeeId, current.id),
                ne(attendanceShift.status, 'cancelled'),
                gt(attendanceShift.endsAt, new Date()),
              ),
            );
          if (
            nightShifts.some(
              (shift) =>
                maternalNightWork(
                  scheduledWorkIntervals(shift),
                  protectedPeriods,
                ) &&
                !maternalNightWork(
                  scheduledWorkIntervals(shift),
                  maternalProtectionPeriods(current),
                ),
            )
          )
            throw conflictError('maternalNightWork');
        }
        if (workPermitRequired(dto.legalStatus)) {
          const upcoming = await tx
            .select({
              startsAt: attendanceShift.startsAt,
              endsAt: attendanceShift.endsAt,
            })
            .from(attendanceShift)
            .where(
              and(
                eq(attendanceShift.employeeId, current.id),
                ne(attendanceShift.status, 'cancelled'),
                gt(attendanceShift.endsAt, new Date()),
              ),
            );
          const permitted = (
            employee: Pick<typeof dto, 'legalStatus' | 'workPermits'>,
            shift: (typeof upcoming)[number],
          ) =>
            !workPermitRequired(employee.legalStatus) ||
            intervalWithinPeriods(
              employee.workPermits,
              shift.startsAt,
              shift.endsAt,
            );
          if (
            upcoming.some(
              (shift) => permitted(current, shift) && !permitted(dto, shift),
            )
          )
            throw conflictError('workPermitRequired');
        }
        const addedHolidays = indigenousHolidays.filter(
          (date) => !current.indigenousHolidays.includes(date),
        );
        const removedHolidays = current.indigenousHolidays.filter(
          (date) => !indigenousHolidays.includes(date),
        );
        for (const date of [...addedHolidays, ...removedHolidays]) {
          const dayStart = new Date(`${date}T00:00:00${STORE_UTC_OFFSET}`);
          await assertPayrollUnlocked(
            tx,
            actor.organizationId,
            current.id,
            dayStart,
            new Date(dayStart.getTime() + DAY_MS),
          );
        }
        if (removedHolidays.length) {
          const [substituted] = await tx
            .select({ id: attendanceHolidaySubstitute.id })
            .from(attendanceHolidaySubstitute)
            .where(
              and(
                eq(attendanceHolidaySubstitute.employeeId, current.id),
                inArray(
                  attendanceHolidaySubstitute.holidayDate,
                  removedHolidays,
                ),
              ),
            )
            .limit(1);
          if (substituted) throw conflictError('indigenousHolidayInUse');
        }
        if (addedHolidays.length)
          await tx
            .update(attendanceShift)
            .set({ dayKind: 'holiday' })
            .where(
              and(
                eq(attendanceShift.employeeId, current.id),
                eq(attendanceShift.dayKind, 'workday'),
                inArray(shiftStartDate, addedHolidays),
              ),
            );
        if (removedHolidays.length)
          await tx
            .update(attendanceShift)
            .set({ dayKind: 'workday' })
            .where(
              and(
                eq(attendanceShift.employeeId, current.id),
                eq(attendanceShift.dayKind, 'holiday'),
                inArray(shiftStartDate, removedHolidays),
              ),
            );
        for (const [before, after] of [
          [current.hiredAt, hiredAt],
          [current.terminatedAt, terminatedAt],
        ]) {
          if (before?.getTime() === after?.getTime()) continue;
          const dates = [before, after].filter((date) => date !== null);
          await assertPayrollUnlocked(
            tx,
            actor.organizationId,
            current.id,
            new Date(Math.min(...dates.map((date) => date.getTime()))),
          );
        }
      }
      const values = {
        organizationId: actor.organizationId,
        userId: dto.userId,
        birthDate: dto.birthDate,
        taiwanStaySince:
          dto.legalStatus === 'national' ? null : (dto.taiwanStaySince ?? null),
        legalStatus: dto.legalStatus,
        studentVacations:
          dto.legalStatus === 'foreignStudent' ? dto.studentVacations : [],
        workPermits: workPermitRequired(dto.legalStatus) ? dto.workPermits : [],
        pregnancyPeriods: dto.pregnancyPeriods,
        nursingPeriods: dto.nursingPeriods,
        childcareReductionPeriods: dto.childcareReductionPeriods,
        indigenousHolidays,
        ...restWeekdays,
        hiredAt,
        terminatedAt,
        terminationReason: dto.terminationReason ?? null,
        terminationNoticedAt,
      };
      const [row] = await tx
        .insert(attendanceEmployee)
        .values({ id: restored?.id ?? randomUUID(), ...values })
        .onConflictDoUpdate({
          target: [
            attendanceEmployee.organizationId,
            attendanceEmployee.userId,
          ],
          set: values,
        })
        .returning();
      await writeAudit(
        tx,
        actor,
        current
          ? 'employee.update'
          : restored
            ? 'employee.restore'
            : 'employee.create',
        row.id,
        current ? auditChanges(current, values) : values,
      );
      await restored?.finalize(tx);
      return {
        ...row,
        ...legalStatusObligations(row.legalStatus),
        name: membership.name,
        email: membership.email,
        employmentType: await currentEmploymentType(tx, row),
        status: employeeStatus(row),
      };
    });
  }

  async deleteEmployee(actor: AttendanceActor, id: string) {
    await this.deleteEmployees(actor, [id]);
    return { id };
  }

  async deleteEmployees(actor: AttendanceActor, ids: string[]) {
    try {
      await this.db.transaction(async (tx) => {
        await lockOrganization(tx, actor.organizationId);
        for (const id of ids) {
          await startDeletedRecordBatch(tx);
          const [row] = await tx
            .select({
              id: attendanceEmployee.id,
              userId: attendanceEmployee.userId,
            })
            .from(attendanceEmployee)
            .where(
              and(
                eq(attendanceEmployee.id, id),
                eq(attendanceEmployee.organizationId, actor.organizationId),
              ),
            );
          if (!row) throw new NotFoundException();
          await writeAudit(tx, actor, 'employee.delete', id, {
            userId: row.userId,
          });
          await tx
            .delete(attendanceEmployee)
            .where(eq(attendanceEmployee.id, id));
        }
      });
    } catch (error) {
      // 有任何出勤或薪資紀錄就已是僱傭事實，只能以離職日結束，不可刪除
      if (isForeignKeyViolation(error)) throw conflictError('employeeInUse');
      throw error;
    }
  }

  async settings(actor: AttendanceActor) {
    const [row] = await this.db
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.organizationId, actor.organizationId));
    if (!row) throw new NotFoundException();
    return row;
  }

  async saveSettings(actor: AttendanceActor, dto: SaveAttendanceSettingsDto) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      if (hasOverlappingOvertimeExtensions(dto.overtimeExtensionPeriods))
        throw badRequestError('overlappingOvertimeExtensions');
      const overtimeAgreedFrom = dto.overtimeAgreedFrom ?? null;
      if (
        dto.overtimeExtensionPeriods.some(
          (period) =>
            overtimeAgreedFrom === null ||
            period < overtimeAgreedFrom.slice(0, 7),
        )
      )
        throw badRequestError('overtimeAgreementRequired');
      const [current] = await tx
        .select()
        .from(attendanceSettings)
        .where(eq(attendanceSettings.organizationId, actor.organizationId));
      const voluntaryLaborInsuranceFrom =
        dto.voluntaryLaborInsuranceFrom ?? null;
      const changedFrom = [
        [
          current?.voluntaryLaborInsuranceFrom ?? null,
          voluntaryLaborInsuranceFrom,
        ],
        [
          current?.overtimeAgreedFrom?.slice(0, 7) ?? null,
          overtimeAgreedFrom?.slice(0, 7) ?? null,
        ],
      ]
        .filter(([previous, next]) => previous !== next)
        .flat()
        .filter((month) => month !== null)
        .sort()[0];
      if (changedFrom) {
        const [published] = await tx
          .select({ id: payrollStatement.id })
          .from(payrollStatement)
          .where(
            and(
              eq(payrollStatement.organizationId, actor.organizationId),
              eq(payrollStatement.status, 'published'),
              gte(payrollStatement.month, changedFrom),
            ),
          )
          .limit(1);
        if (published) throw conflictError('payrollLocked');
      }
      if (
        dto.occupationalIndustryCode &&
        !(await currentOccupationalIndustryRates(tx)).some(
          ({ code }) => code === dto.occupationalIndustryCode,
        )
      )
        throw badRequestError('occupationalIndustryInvalid');
      const values = {
        ...dto,
        allowedIps: dto.allowedIps.map(normalizeIpRange),
        laborInsuranceUnitCode: dto.laborInsuranceUnitCode ?? null,
        occupationalIndustryCode: dto.occupationalIndustryCode ?? null,
        occupationalExperienceRateMicros:
          dto.occupationalExperienceRateMicros ?? null,
        voluntaryLaborInsuranceFrom,
        overtimeAgreedFrom,
        payday: dto.payday ?? null,
        overtimeExtensionPeriods: [
          ...new Set(dto.overtimeExtensionPeriods),
        ].sort(),
        updatedAt: new Date(),
      };
      const [row] = await tx
        .insert(attendanceSettings)
        .values({ organizationId: actor.organizationId, ...values })
        .onConflictDoUpdate({
          target: attendanceSettings.organizationId,
          set: values,
        })
        .returning();
      await writeAudit(
        tx,
        actor,
        'settings.update',
        actor.organizationId,
        current ? auditChanges(current, values) : values,
      );
      return row;
    });
  }
}
