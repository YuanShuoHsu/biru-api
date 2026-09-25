import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
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

import { isAuthorized } from 'src/auth/permissions';
import {
  platformDateString,
  platformMidnight,
} from 'src/common/constants/timezone';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';
import {
  ATTENDANCE_LEGAL_STATUSES,
  attendanceEmployee,
  attendanceLeaveCase,
  attendanceLeaveType,
  attendanceRequest,
  attendanceSettings,
  attendanceShift,
  type AttendanceEmploymentType,
} from 'src/db/schema/attendance';
import { member } from 'src/db/schema/organizations';
import { user } from 'src/db/schema/users';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';
import { legalStatusObligations } from 'src/payroll/taiwan-rules';

import type { AttendanceActor } from './attendance-actor';
import {
  assertPayrollUnlocked,
  lockOrganization,
  writeAudit,
  type Transaction,
} from './attendance-audit';
import { badRequestError, conflictError } from './attendance-errors';
import {
  ageOn,
  hasOverlappingOvertimeExtensions,
  maternalNightWork,
  MINIMUM_WORKING_AGE,
  normalizeIpRange,
  NOTICE_TERMINATION_REASONS,
  restDayDesignationConflict,
  scheduledWorkIntervals,
  workPermitRequired,
} from './attendance-rules';
import {
  ATTENDANCE_EMPLOYEE_DATE_FILTER_FIELDS,
  ATTENDANCE_EMPLOYEE_ENUM_FILTER_FIELDS,
  ATTENDANCE_EMPLOYEE_STRING_FILTER_FIELDS,
  AttendanceEmployeePaginationQueryDto,
} from './dto/attendance-employee-pagination-query.dto';
import { SaveAttendanceEmployeeDto } from './dto/save-attendance-employee.dto';
import { SaveAttendanceSettingsDto } from './dto/save-attendance-settings.dto';
import {
  employmentType,
  employmentTypeSql,
  loadOneEmployeeHours,
  weeklyMinutesAt,
} from './employee-hours';
import { findEmployee } from './employee-lookup';
import {
  employeeStatus,
  employeeStatusOrderSql,
  employeeStatusSql,
} from './employee-status';

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
        shiftTemplate: ['create', 'update', 'delete', 'read'],
      }),
      canManageSettings: isAuthorized(actor.role, {
        attendanceSetting: ['read', 'update'],
        leaveType: ['create', 'update'],
      }),
      canManagePayroll: isAuthorized(actor.role, {
        payrollTerm: ['create', 'update', 'read'],
        payslip: ['create', 'update', 'read'],
      }),
    };
  }

  legalStatusObligations() {
    return ATTENDANCE_LEGAL_STATUSES.map((legalStatus) => ({
      legalStatus,
      ...legalStatusObligations(legalStatus),
    }));
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
        : (fieldMap[sortBy ?? ''] ?? user.name);
    const [data, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: attendanceEmployee.id,
          organizationId: attendanceEmployee.organizationId,
          userId: attendanceEmployee.userId,
          name: user.name,
          employmentType: sql<AttendanceEmploymentType>`${employmentTypeSql}`,
          birthDate: attendanceEmployee.birthDate,
          taiwanStaySince: attendanceEmployee.taiwanStaySince,
          legalStatus: attendanceEmployee.legalStatus,
          studentVacations: attendanceEmployee.studentVacations,
          workPermits: attendanceEmployee.workPermits,
          maternalProtectionPeriods:
            attendanceEmployee.maternalProtectionPeriods,
          regularLeaveWeekday: attendanceEmployee.regularLeaveWeekday,
          restDayWeekday: attendanceEmployee.restDayWeekday,
          enabled: attendanceEmployee.enabled,
          hiredAt: attendanceEmployee.hiredAt,
          terminatedAt: attendanceEmployee.terminatedAt,
          terminationReason: attendanceEmployee.terminationReason,
          terminationNoticedAt: attendanceEmployee.terminationNoticedAt,
          status: employeeStatusSql,
          createdAt: attendanceEmployee.createdAt,
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
      data: data.map((row) => ({
        ...row,
        ...legalStatusObligations(row.legalStatus),
      })),
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
        : (fieldMap[sortBy ?? ''] ?? user.name);
    const [data, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: attendanceEmployee.id,
          organizationId: member.organizationId,
          userId: member.userId,
          name: user.name,
          email: user.email,
          joinedAt: member.createdAt,
          employmentType: employmentTypeSql,
          birthDate: attendanceEmployee.birthDate,
          taiwanStaySince: attendanceEmployee.taiwanStaySince,
          legalStatus: attendanceEmployee.legalStatus,
          studentVacations: attendanceEmployee.studentVacations,
          workPermits: attendanceEmployee.workPermits,
          maternalProtectionPeriods:
            attendanceEmployee.maternalProtectionPeriods,
          regularLeaveWeekday: attendanceEmployee.regularLeaveWeekday,
          restDayWeekday: attendanceEmployee.restDayWeekday,
          enabled: attendanceEmployee.enabled,
          hiredAt: attendanceEmployee.hiredAt,
          terminatedAt: attendanceEmployee.terminatedAt,
          terminationReason: attendanceEmployee.terminationReason,
          terminationNoticedAt: attendanceEmployee.terminationNoticedAt,
          status: employeeStatusSql,
          createdAt: attendanceEmployee.createdAt,
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
        ({ email, joinedAt, name, status, userId, ...employee }) => ({
          email,
          joinedAt,
          name,
          status,
          userId,
          employee:
            employee.id === null ||
            employee.hiredAt === null ||
            employee.enabled === null ||
            employee.employmentType === null ||
            employee.legalStatus === null ||
            employee.studentVacations === null ||
            employee.workPermits === null ||
            employee.maternalProtectionPeriods === null ||
            employee.createdAt === null
              ? null
              : {
                  ...employee,
                  id: employee.id,
                  hiredAt: employee.hiredAt,
                  enabled: employee.enabled,
                  employmentType: employee.employmentType,
                  legalStatus: employee.legalStatus,
                  studentVacations: employee.studentVacations,
                  workPermits: employee.workPermits,
                  maternalProtectionPeriods: employee.maternalProtectionPeriods,
                  ...legalStatusObligations(employee.legalStatus),
                  createdAt: employee.createdAt,
                  userId,
                  name,
                },
        }),
      ),
      total,
    };
  }

  async saveEmployee(actor: AttendanceActor, dto: SaveAttendanceEmployeeDto) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [membership] = await tx
        .select({ name: user.name })
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
          ...dto.maternalProtectionPeriods,
        ].some(({ from, to }) => from > to)
      )
        throw badRequestError('invalidInterval');
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
        .select({
          id: attendanceEmployee.id,
          enabled: attendanceEmployee.enabled,
          hiredAt: attendanceEmployee.hiredAt,
          terminatedAt: attendanceEmployee.terminatedAt,
        })
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
        if (dto.maternalProtectionPeriods.length) {
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
            nightShifts.some((shift) =>
              maternalNightWork(
                scheduledWorkIntervals(shift),
                dto.maternalProtectionPeriods,
              ),
            )
          )
            throw conflictError('maternalNightWork');
        }
        if (current.enabled && !dto.enabled) {
          const [scheduledShift] = await tx
            .select({ id: attendanceShift.id })
            .from(attendanceShift)
            .where(
              and(
                eq(attendanceShift.employeeId, current.id),
                ne(attendanceShift.status, 'cancelled'),
                gt(attendanceShift.endsAt, new Date()),
              ),
            )
            .limit(1);
          const [pendingRequest] = await tx
            .select({ id: attendanceRequest.id })
            .from(attendanceRequest)
            .where(
              and(
                eq(attendanceRequest.employeeId, current.id),
                inArray(attendanceRequest.status, [
                  'pending',
                  'cancellationPending',
                ]),
              ),
            )
            .limit(1);
          if (scheduledShift || pendingRequest)
            throw conflictError('employeeDisableConflict');
        }
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
        enabled: dto.enabled,
        birthDate: dto.birthDate,
        taiwanStaySince:
          dto.legalStatus === 'national' ? null : (dto.taiwanStaySince ?? null),
        legalStatus: dto.legalStatus,
        studentVacations:
          dto.legalStatus === 'foreignStudent' ? dto.studentVacations : [],
        workPermits: workPermitRequired(dto.legalStatus) ? dto.workPermits : [],
        maternalProtectionPeriods: dto.maternalProtectionPeriods,
        ...restWeekdays,
        hiredAt,
        terminatedAt,
        terminationReason: dto.terminationReason ?? null,
        terminationNoticedAt,
      };
      const [row] = await tx
        .insert(attendanceEmployee)
        .values({ id: randomUUID(), ...values })
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
        current ? 'employee.update' : 'employee.create',
        row.id,
        values,
      );
      return {
        ...row,
        ...legalStatusObligations(row.legalStatus),
        name: membership.name,
        employmentType: await currentEmploymentType(tx, row),
        status: employeeStatus(row),
      };
    });
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
      const values = {
        ...dto,
        allowedIps: dto.allowedIps.map(normalizeIpRange),
        laborInsuranceUnitCode: dto.laborInsuranceUnitCode ?? null,
        occupationalAccidentRateMicros:
          dto.occupationalAccidentRateMicros ?? null,
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
        values,
      );
      return row;
    });
  }
}
