import { Inject, Injectable } from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
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
  ATTENDANCE_EMPLOYEE_BOOLEAN_FILTER_FIELDS,
  ATTENDANCE_EMPLOYEE_DATE_FILTER_FIELDS,
  ATTENDANCE_EMPLOYEE_NUMBER_FILTER_FIELDS,
  ATTENDANCE_EMPLOYEE_STRING_FILTER_FIELDS,
  AttendanceEmployeePaginationQueryDto,
} from './dto/attendance-employee-pagination-query.dto';
import { SaveAttendanceEmployeeDto } from './dto/save-attendance-employee.dto';
import { SaveAttendanceSettingsDto } from './dto/save-attendance-settings.dto';
import { weeklyMinutesAt, type EmployeeHours } from './employee-hours';
import { findEmployee } from './employee-lookup';

const currentWeeklyMinutes = sql<number>`COALESCE(
  (SELECT (change ->> 'minutes')::int
     FROM jsonb_array_elements(${attendanceEmployee.weeklyMinutesHistory}) change
    WHERE (change ->> 'from')::timestamptz <= now()
    ORDER BY (change ->> 'from')::timestamptz DESC
    LIMIT 1),
  (${attendanceEmployee.weeklyMinutesHistory} -> 0 ->> 'minutes')::int,
  ${attendanceEmployee.weeklyMinutes})`;

const withCurrentWeeklyMinutes = <T extends EmployeeHours>(employee: T): T => ({
  ...employee,
  weeklyMinutes: weeklyMinutesAt(employee, new Date()),
});

@Injectable()
export class AttendanceEmployeesService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async context(actor: AttendanceActor) {
    const employee = await findEmployee(actor, this.db);
    return {
      employee: employee ? withCurrentWeeklyMinutes(employee) : null,
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

  async members(actor: AttendanceActor) {
    return this.db
      .select({ userId: member.userId, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, actor.organizationId));
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
      name: attendanceEmployee.name,
      hiredAt: attendanceEmployee.hiredAt,
      terminatedAt: attendanceEmployee.terminatedAt,
      weeklyMinutes: currentWeeklyMinutes,
      enabled: attendanceEmployee.enabled,
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
            [],
            ATTENDANCE_EMPLOYEE_NUMBER_FILTER_FIELDS,
            [],
            [],
            ATTENDANCE_EMPLOYEE_BOOLEAN_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(attendanceEmployee.name, `%${value}%`),
          ilike(localTimeText(attendanceEmployee.hiredAt), `%${value}%`),
          ilike(localTimeText(attendanceEmployee.terminatedAt), `%${value}%`),
        ],
      }),
    );
    const sort = sortDirection === 'desc' ? desc : asc;
    const [data, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(attendanceEmployee)
        .where(where)
        .orderBy(
          sort(sortBy ? fieldMap[sortBy] : attendanceEmployee.name),
          asc(attendanceEmployee.id),
        )
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(attendanceEmployee).where(where),
    ]);
    return { data: data.map(withCurrentWeeklyMinutes), total };
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
      const hiredAt = new Date(dto.hiredAt);
      const terminatedAt = dto.terminatedAt ? new Date(dto.terminatedAt) : null;
      if (terminatedAt && terminatedAt <= hiredAt)
        throw badRequestError('invalidInterval');
      const [current] = await tx
        .select({
          id: attendanceEmployee.id,
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
      const requested = dto.weeklyMinutes ?? current?.weeklyMinutes ?? 2400;
      const weeklyMinutesHistory = await this.recordWeeklyMinutes(
        tx,
        actor,
        current,
        requested,
        hiredAt,
        dto.weeklyMinutesFrom,
      );
      const weeklyMinutes = weeklyMinutesAt(
        { weeklyMinutes: requested, weeklyMinutesHistory },
        new Date(),
      );
      const values = {
        organizationId: actor.organizationId,
        userId: dto.userId,
        name: membership.name,
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
      return row;
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
    from?: string,
  ): Promise<WeeklyMinutesChange[]> {
    if (!current)
      return [{ from: hiredAt.toISOString(), minutes: weeklyMinutes }];
    if (weeklyMinutes === current.weeklyMinutes)
      return current.weeklyMinutesHistory.length
        ? current.weeklyMinutesHistory
        : [{ from: hiredAt.toISOString(), minutes: weeklyMinutes }];
    if (!from) throw badRequestError('weeklyMinutesFromRequired');
    const effectiveFrom = new Date(from);
    if (effectiveFrom < hiredAt)
      throw badRequestError('weeklyMinutesFromRequired');
    await assertPayrollUnlocked(
      tx,
      actor.organizationId,
      current.id,
      effectiveFrom,
    );

    return [
      ...current.weeklyMinutesHistory.filter(
        (change) => new Date(change.from).getTime() !== effectiveFrom.getTime(),
      ),
      { from: effectiveFrom.toISOString(), minutes: weeklyMinutes },
    ].sort((a, b) => a.from.localeCompare(b.from));
  }

  async settings(actor: AttendanceActor) {
    const [row] = await this.db
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.organizationId, actor.organizationId));
    return row ?? null;
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
