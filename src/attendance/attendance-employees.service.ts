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
import { platformMidnight } from 'src/common/constants/timezone';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';
import {
  attendanceEmployee,
  attendanceLeaveCase,
  attendanceRequest,
  attendanceSettings,
  attendanceShift,
  type AttendanceEmploymentType,
  type WeeklyMinutesChange,
} from 'src/db/schema/attendance';
import { member } from 'src/db/schema/organizations';
import { user } from 'src/db/schema/users';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import type { AttendanceActor } from './attendance-actor';
import {
  assertPayrollUnlocked,
  lockOrganization,
  writeAudit,
  type Transaction,
} from './attendance-audit';
import { badRequestError, conflictError } from './attendance-errors';
import { normalizeIpRange } from './attendance-rules';
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
  FULL_TIME_WEEKLY_MINUTES,
  weeklyMinutesAt,
  type EmployeeHours,
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

const currentWeeklyMinutes = sql<number>`COALESCE(
  (SELECT (change ->> 'minutes')::int
     FROM jsonb_array_elements(${attendanceEmployee.weeklyMinutesHistory}) change
    WHERE (change ->> 'from')::timestamptz <= now()
    ORDER BY (change ->> 'from')::timestamptz DESC
    LIMIT 1),
  (${attendanceEmployee.weeklyMinutesHistory} -> 0 ->> 'minutes')::int,
  ${attendanceEmployee.weeklyMinutes})`;

const employmentTypeSql = sql<AttendanceEmploymentType | null>`CASE
  WHEN ${attendanceEmployee.id} IS NULL THEN NULL
  WHEN ${currentWeeklyMinutes} < ${sql.raw(String(FULL_TIME_WEEKLY_MINUTES))} THEN 'partTime'
  ELSE 'fullTime'
END`;

const withCurrentHours = <T extends EmployeeHours>(employee: T) => {
  const weeklyMinutes = weeklyMinutesAt(employee, new Date());

  return {
    ...employee,
    weeklyMinutes,
    employmentType: employmentType(weeklyMinutes),
  };
};

@Injectable()
export class AttendanceEmployeesService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async context(actor: AttendanceActor) {
    const employee = await findEmployee(actor, this.db);
    return {
      employee: employee
        ? {
            ...withCurrentHours(employee),
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
          weeklyMinutes: attendanceEmployee.weeklyMinutes,
          weeklyMinutesHistory: attendanceEmployee.weeklyMinutesHistory,
          enabled: attendanceEmployee.enabled,
          hiredAt: attendanceEmployee.hiredAt,
          terminatedAt: attendanceEmployee.terminatedAt,
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
    return { data: data.map(withCurrentHours), total };
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
          weeklyMinutes: attendanceEmployee.weeklyMinutes,
          weeklyMinutesHistory: attendanceEmployee.weeklyMinutesHistory,
          enabled: attendanceEmployee.enabled,
          hiredAt: attendanceEmployee.hiredAt,
          terminatedAt: attendanceEmployee.terminatedAt,
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
            employee.weeklyMinutes === null ||
            employee.weeklyMinutesHistory === null ||
            employee.createdAt === null
              ? null
              : withCurrentHours({
                  ...employee,
                  id: employee.id,
                  hiredAt: employee.hiredAt,
                  enabled: employee.enabled,
                  weeklyMinutes: employee.weeklyMinutes,
                  weeklyMinutesHistory: employee.weeklyMinutesHistory,
                  createdAt: employee.createdAt,
                  userId,
                  name,
                }),
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
      const [current] = await tx
        .select({
          id: attendanceEmployee.id,
          enabled: attendanceEmployee.enabled,
          hiredAt: attendanceEmployee.hiredAt,
          terminatedAt: attendanceEmployee.terminatedAt,
          weeklyMinutes: attendanceEmployee.weeklyMinutes,
          weeklyMinutesHistory: attendanceEmployee.weeklyMinutesHistory,
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
      const requested =
        dto.weeklyMinutes ??
        (current ? weeklyMinutesAt(current, new Date()) : 2400);
      const weeklyMinutesHistory = await this.recordWeeklyMinutes(
        tx,
        actor,
        current,
        requested,
        hiredAt,
        terminatedAt,
        dto.weeklyMinutesFrom,
      );
      const weeklyMinutes = weeklyMinutesAt(
        { weeklyMinutes: requested, weeklyMinutesHistory },
        new Date(),
      );
      const values = {
        organizationId: actor.organizationId,
        userId: dto.userId,
        enabled: dto.enabled,
        weeklyMinutes,
        weeklyMinutesHistory,
        hiredAt,
        terminatedAt,
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
      return withCurrentHours({
        ...row,
        name: membership.name,
        status: employeeStatus(row),
      });
    });
  }

  private async recordWeeklyMinutes(
    tx: Transaction,
    actor: AttendanceActor,
    current:
      | {
          id: string;
          weeklyMinutes: number;
          weeklyMinutesHistory: WeeklyMinutesChange[];
        }
      | undefined,
    weeklyMinutes: number,
    hiredAt: Date,
    terminatedAt: Date | null,
    from?: string,
  ): Promise<WeeklyMinutesChange[]> {
    if (!current)
      return [{ from: hiredAt.toISOString(), minutes: weeklyMinutes }];
    const now = new Date();
    // 已生效的區段不能動，否則過去期間的法定額度會被回溯改寫；未生效的區段由這次請求完整描述
    const settled = current.weeklyMinutesHistory.filter(({ from }) => {
      const at = new Date(from);

      return (
        (!terminatedAt || at < terminatedAt) &&
        (at.getTime() === hiredAt.getTime() || at <= now)
      );
    });
    const anchored = settled.length
      ? settled
      : [{ from: hiredAt.toISOString(), minutes: weeklyMinutes }];
    if (!from) {
      if (weeklyMinutes !== weeklyMinutesAt(current, now))
        throw badRequestError('weeklyMinutesFromRequired');

      return anchored;
    }
    const effectiveFrom = platformDayStart(from);
    if (effectiveFrom < hiredAt)
      throw badRequestError('weeklyMinutesFromRequired');
    if (terminatedAt && effectiveFrom >= terminatedAt)
      throw badRequestError('weeklyMinutesFromOutsideEmployment');
    await assertPayrollUnlocked(
      tx,
      actor.organizationId,
      current.id,
      effectiveFrom,
    );

    return [
      ...settled.filter(
        ({ from }) => new Date(from).getTime() !== effectiveFrom.getTime(),
      ),
      { from: effectiveFrom.toISOString(), minutes: weeklyMinutes },
    ].sort((a, b) => a.from.localeCompare(b.from));
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
      const values = {
        ...dto,
        allowedIps: dto.allowedIps.map(normalizeIpRange),
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
