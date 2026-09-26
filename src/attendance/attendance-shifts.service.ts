import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  ne,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';
import {
  attendanceEmployee,
  attendanceEvent,
  attendanceLeaveType,
  attendanceRequest,
  attendanceSettings,
  attendanceShift,
  type AttendanceDayKind,
  statutoryHoliday,
} from 'src/db/schema/attendance';
import { user } from 'src/db/schema/users';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';
import {
  DAY_MS,
  platformDateString,
  platformMidnight,
  toPlatformTime,
} from 'src/common/constants/timezone';

import type { AttendanceActor } from './attendance-actor';
import {
  assertPayrollUnlocked,
  lockEmployee,
  lockOrganization,
  type Transaction,
  writeAudit,
  writeAudits,
} from './attendance-audit';
import {
  badRequestError,
  conflictError,
  forbiddenError,
} from './attendance-errors';
import {
  ADULT_WORKING_AGE,
  ageOn,
  agreedWorkdates,
  blockingRequestStatuses,
  childLaborViolation,
  distanceMeters,
  exceedsConsecutiveWorkdays,
  exceedsStudentWeeklyLimit,
  hasShortRestBetweenShifts,
  lacksWeeklyRest,
  ipInRange,
  MAX_CONSECUTIVE_WORKDAYS,
  MAX_DAILY_WORK_SECONDS,
  MAX_SHIFT_MS,
  normalizeIp,
  punchLeewayMs,
  countedIntervals,
  maternalNightWork,
  maternalProtectionPeriods,
  designatedDayKind,
  employeeHolidays,
  weekdayOfDate,
  type ScheduledShift,
  scheduledWorkIntervals,
  scheduledWorkSeconds,
  SHIFT_STATE_BY_LAST_ACTION,
  SHIFT_STATE_RANK,
  summarizeEvents,
  unreviewedOvertime,
  withinPeriods,
  workPermitRequired,
} from './attendance-rules';
import { AttendanceShiftRangeQueryDto } from './dto/attendance-shift-range-query.dto';
import {
  ATTENDANCE_SHIFT_DATE_FILTER_FIELDS,
  ATTENDANCE_SHIFT_ENUM_FILTER_FIELDS,
  ATTENDANCE_SHIFT_STRING_FILTER_FIELDS,
  AttendanceShiftPaginationQueryDto,
} from './dto/attendance-shift-pagination-query.dto';
import { CreateAttendancePunchDto } from './dto/create-attendance-punch.dto';
import {
  CreateAttendanceShiftDto,
  UpdateAttendanceShiftDto,
} from './dto/create-attendance-shifts.dto';
import { requireActiveEmployee, requireEmployee } from './employee-lookup';
import { loadAgreedHolidays } from './holiday-substitutes';
import { parseBreaks, parseInterval } from './shift-intervals';
import { unfinishedShift } from './shift-queries';

const shiftStateCase = sql.join(
  Object.entries(SHIFT_STATE_BY_LAST_ACTION).map(
    ([action, state]) => sql`WHEN ${action} THEN ${SHIFT_STATE_RANK[state]}`,
  ),
  sql` `,
);

const approvedCorrectedEvents = sql`(SELECT correction.corrected_events
  FROM ${attendanceRequest} correction
  WHERE correction.shift_id = ${attendanceShift.id}
    AND correction.kind = 'correction'
    AND correction.status = 'approved'
  ORDER BY correction.reviewed_at DESC
  LIMIT 1)`;

const clockInAt = sql<Date | null>`CASE
  WHEN ${approvedCorrectedEvents} IS NOT NULL
    THEN (${approvedCorrectedEvents} -> 0 ->> 'occurredAt')::timestamptz
  ELSE (SELECT min(event.occurred_at) FROM ${attendanceEvent} event
    WHERE event.shift_id = ${attendanceShift.id} AND event.action = 'clockIn')
  END`.mapWith(attendanceShift.startsAt);

const clockOutAt = sql<Date | null>`CASE
  WHEN ${approvedCorrectedEvents} IS NOT NULL
    THEN (${approvedCorrectedEvents} -> -1 ->> 'occurredAt')::timestamptz
  ELSE (SELECT max(event.occurred_at) FROM ${attendanceEvent} event
    WHERE event.shift_id = ${attendanceShift.id} AND event.action = 'clockOut')
  END`.mapWith(attendanceShift.startsAt);

const CALENDAR_SHIFT_LIMIT = 500;

const punchLeewaySql = sql`greatest(interval '0',
  make_interval(secs => ${sql.raw(String(MAX_DAILY_WORK_SECONDS))})
    - (${attendanceShift.endsAt} - ${attendanceShift.startsAt} - CASE
      WHEN ${attendanceShift.paidBreak} THEN interval '0'
      ELSE (SELECT coalesce(sum((b->>'endsAt')::timestamptz - (b->>'startsAt')::timestamptz), interval '0')
        FROM jsonb_array_elements(${attendanceShift.breaks}) b)
    END))`;

const punchableShift = sql`${unfinishedShift}
  AND (EXISTS (SELECT 1 FROM ${attendanceEvent} started WHERE started.shift_id = ${attendanceShift.id})
    OR now() BETWEEN ${attendanceShift.startsAt} - ${punchLeewaySql} AND ${attendanceShift.endsAt})`;

const assertShiftWithoutRecords = async (
  tx: Transaction,
  shift: typeof attendanceShift.$inferSelect,
) => {
  const [event] = await tx
    .select({ id: attendanceEvent.id })
    .from(attendanceEvent)
    .where(eq(attendanceEvent.shiftId, shift.id))
    .limit(1);
  const [request] = await tx
    .select({ id: attendanceRequest.id })
    .from(attendanceRequest)
    .where(
      and(
        eq(attendanceRequest.shiftId, shift.id),
        inArray(attendanceRequest.status, blockingRequestStatuses),
      ),
    )
    .limit(1);
  const [leave] = await tx
    .select({ id: attendanceRequest.id })
    .from(attendanceRequest)
    .where(
      and(
        eq(attendanceRequest.employeeId, shift.employeeId),
        eq(attendanceRequest.kind, 'leave'),
        inArray(attendanceRequest.status, blockingRequestStatuses),
        lt(attendanceRequest.startsAt, shift.endsAt),
        sql`${attendanceRequest.endsAt} > ${shift.startsAt}`,
      ),
    )
    .limit(1);
  if (event || request || leave) throw conflictError('shiftHasRecords');
};

@Injectable()
export class AttendanceShiftsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async shifts(
    actor: AttendanceActor,
    query: AttendanceShiftPaginationQueryDto,
    mine: boolean,
    scope?: SQL,
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
      startsAt: attendanceShift.startsAt,
      endsAt: attendanceShift.endsAt,
      clockInAt,
      clockOutAt,
      dayKind: attendanceShift.dayKind,
      state: sql`CASE COALESCE(
        ${approvedCorrectedEvents} -> -1 ->> 'action',
        (SELECT event.action::text
           FROM ${attendanceEvent} event
          WHERE event.shift_id = ${attendanceShift.id}
          ORDER BY event.occurred_at DESC
          LIMIT 1))
        ${shiftStateCase} ELSE ${SHIFT_STATE_RANK.scheduled} END`,
    };
    const where = and(
      eq(attendanceShift.organizationId, actor.organizationId),
      ne(attendanceShift.status, 'cancelled'),
      employeeId ? eq(attendanceShift.employeeId, employeeId) : undefined,
      scope,
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            ATTENDANCE_SHIFT_STRING_FILTER_FIELDS,
            ATTENDANCE_SHIFT_DATE_FILTER_FIELDS,
            ATTENDANCE_SHIFT_ENUM_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: ATTENDANCE_SHIFT_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(user.name, `%${value}%`),
          ilike(localTimeText(attendanceShift.startsAt), `%${value}%`),
          ilike(localTimeText(attendanceShift.endsAt), `%${value}%`),
        ],
      }),
    );
    const sort = sortDirection === 'asc' ? asc : desc;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          shift: attendanceShift,
          employeeName: user.name,
          clockInAt,
          clockOutAt,
        })
        .from(attendanceShift)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceShift.employeeId),
        )
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(where)
        .orderBy(
          sort(sortBy ? fieldMap[sortBy] : attendanceShift.startsAt),
          asc(attendanceShift.id),
        )
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(attendanceShift)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceShift.employeeId),
        )
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(where),
    ]);
    if (!rows.length) return { data: [], total };
    const ids = rows.map((row) => row.shift.id);
    const [events, corrections, overtime, [settings]] = await Promise.all([
      this.db
        .select()
        .from(attendanceEvent)
        .where(
          and(
            eq(attendanceEvent.organizationId, actor.organizationId),
            inArray(attendanceEvent.shiftId, ids),
          ),
        )
        .orderBy(asc(attendanceEvent.occurredAt)),
      this.db
        .select()
        .from(attendanceRequest)
        .where(
          and(
            eq(attendanceRequest.organizationId, actor.organizationId),
            inArray(attendanceRequest.shiftId, ids),
            eq(attendanceRequest.kind, 'correction'),
            eq(attendanceRequest.status, 'approved'),
          ),
        )
        .orderBy(desc(attendanceRequest.reviewedAt)),
      this.db
        .select({
          shiftId: attendanceRequest.shiftId,
          startsAt: attendanceRequest.startsAt,
          endsAt: attendanceRequest.endsAt,
        })
        .from(attendanceRequest)
        .where(
          and(
            eq(attendanceRequest.organizationId, actor.organizationId),
            inArray(attendanceRequest.shiftId, ids),
            eq(attendanceRequest.kind, 'overtime'),
            inArray(attendanceRequest.status, [
              'pending',
              'approved',
              'rejected',
            ]),
          ),
        ),
      this.db
        .select({ graceMinutes: attendanceSettings.graceMinutes })
        .from(attendanceSettings)
        .where(eq(attendanceSettings.organizationId, actor.organizationId)),
    ]);
    const data = rows.map(({ shift, employeeName, clockInAt, clockOutAt }) => {
      const rawEvents = events
        .filter((event) => event.shiftId === shift.id)
        .map(({ action, occurredAt, paidBreak }) => ({
          action,
          occurredAt: occurredAt.toISOString(),
          paidBreak,
        }));
      const correctedEvents = corrections.find(
        (request) => request.shiftId === shift.id,
      )?.correctedEvents;
      const effectiveEvents = correctedEvents ?? rawEvents;
      const summary = summarizeEvents(effectiveEvents, shift);
      const extraWork =
        summary.state === 'completed'
          ? unreviewedOvertime(
              countedIntervals(effectiveEvents, shift),
              shift,
              overtime
                .filter((request) => request.shiftId === shift.id)
                .map((request) => ({
                  start: request.startsAt.getTime(),
                  end: request.endsAt.getTime(),
                })),
            )
          : [];
      const first = effectiveEvents[0],
        last = effectiveEvents.at(-1);
      const grace = (settings?.graceMinutes ?? 0) * 60000;
      return {
        ...shift,
        employeeName,
        clockInAt,
        clockOutAt,
        events: effectiveEvents,
        originalEvents: correctedEvents ? rawEvents : null,
        ...summary,
        unreviewedOvertime: extraWork.map(({ start, end }) => ({
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(end).toISOString(),
        })),
        late:
          !!first &&
          new Date(first.occurredAt).getTime() >
            shift.startsAt.getTime() + grace,
        early:
          !!last &&
          last.action === 'clockOut' &&
          new Date(last.occurredAt).getTime() < shift.endsAt.getTime() - grace,
      };
    });
    return { data, total };
  }

  async punchableShifts(actor: AttendanceActor) {
    const { data } = await this.shifts(
      actor,
      { limit: 10, sortBy: 'startsAt', sortDirection: 'asc' },
      true,
      punchableShift,
    );
    return data;
  }

  async calendarShifts(
    actor: AttendanceActor,
    { from, to }: AttendanceShiftRangeQueryDto,
  ) {
    const shifts: Awaited<ReturnType<typeof this.shifts>>['data'] = [];
    let total: number;
    do {
      const page = await this.shifts(
        actor,
        {
          limit: CALENDAR_SHIFT_LIMIT,
          offset: shifts.length,
          sortBy: 'startsAt',
          sortDirection: 'asc',
        },
        false,
        and(
          sql`${attendanceShift.endsAt} > ${new Date(from)}`,
          lt(attendanceShift.startsAt, new Date(to)),
        ),
      );
      shifts.push(...page.data);
      total = page.total;
      if (!page.data.length) break;
    } while (shifts.length < total);
    return shifts;
  }

  async calendarDayKinds(
    actor: AttendanceActor,
    { from, to }: AttendanceShiftRangeQueryDto,
  ) {
    const fromDate = platformDateString(new Date(from));
    const toDate = platformDateString(new Date(to));
    const [employees, statutory] = await Promise.all([
      this.db
        .select({ employee: attendanceEmployee, employeeName: user.name })
        .from(attendanceEmployee)
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(
          and(
            eq(attendanceEmployee.organizationId, actor.organizationId),
            eq(attendanceEmployee.enabled, true),
          ),
        ),
      this.db
        .select({ date: statutoryHoliday.date, name: statutoryHoliday.name })
        .from(statutoryHoliday)
        .where(
          and(
            gte(statutoryHoliday.date, fromDate),
            lt(statutoryHoliday.date, toDate),
          ),
        ),
    ]);
    const dates: string[] = [];
    for (
      let time = platformMidnight(new Date(from).getTime());
      platformDateString(new Date(time)) < toDate;
      time += DAY_MS
    )
      dates.push(platformDateString(new Date(time)));
    const dayKinds = employees.flatMap(({ employee, employeeName }) => {
      const employedFrom = platformDateString(employee.hiredAt);
      const employedUntil =
        employee.terminatedAt && platformDateString(employee.terminatedAt);
      const ownHolidays = employeeHolidays(statutory, employee).filter(
        ({ date }) => !statutory.some((holiday) => holiday.date === date),
      );
      return dates
        .filter(
          (date) =>
            date >= employedFrom && (!employedUntil || date < employedUntil),
        )
        .flatMap((date) => {
          const holiday = ownHolidays.find((holiday) => holiday.date === date);
          const designated = designatedDayKind(employee, weekdayOfDate(date));
          return [
            ...(holiday
              ? [
                  {
                    employeeId: employee.id,
                    employeeName,
                    date,
                    dayKind: 'holiday' as const,
                    holidayName: holiday.name,
                  },
                ]
              : []),
            ...(designated && designated !== 'workday'
              ? [
                  {
                    employeeId: employee.id,
                    employeeName,
                    date,
                    dayKind: designated,
                  },
                ]
              : []),
          ];
        });
    });
    return { holidays: statutory, dayKinds };
  }

  async createShifts(actor: AttendanceActor, dtos: CreateAttendanceShiftDto[]) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const values = await this.prepareShifts(tx, actor, dtos);
      const rows = await tx.insert(attendanceShift).values(values).returning();
      await writeAudits(
        tx,
        actor,
        'shift.create',
        values.map((value, index) => ({
          resourceId: value.id,
          changes: dtos[index] as unknown as Record<string, unknown>,
        })),
      );
      const byId = new Map(rows.map((row) => [row.id, row]));
      return values.map((value) => byId.get(value.id)!);
    });
  }

  async updateShift(
    actor: AttendanceActor,
    id: string,
    dto: UpdateAttendanceShiftDto,
  ) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [shift] = await tx
        .select()
        .from(attendanceShift)
        .where(
          and(
            eq(attendanceShift.id, id),
            eq(attendanceShift.organizationId, actor.organizationId),
            ne(attendanceShift.status, 'cancelled'),
          ),
        );
      if (!shift) throw new NotFoundException();
      await assertShiftWithoutRecords(tx, shift);
      await assertPayrollUnlocked(
        tx,
        actor.organizationId,
        shift.employeeId,
        shift.startsAt,
        shift.endsAt,
      );
      const [value] = await this.prepareShifts(
        tx,
        actor,
        [{ ...dto, employeeId: shift.employeeId }],
        shift,
      );
      const { startsAt, endsAt, breaks, paidBreak, dayKind } = value;
      const [row] = await tx
        .update(attendanceShift)
        .set({ startsAt, endsAt, breaks, paidBreak, dayKind })
        .where(eq(attendanceShift.id, id))
        .returning();
      await writeAudit(tx, actor, 'shift.update', id, {
        before: {
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          breaks: shift.breaks,
          paidBreak: shift.paidBreak,
          dayKind: shift.dayKind,
        },
        after: { startsAt, endsAt, breaks, paidBreak, dayKind },
      });
      return row;
    });
  }

  private async prepareShifts(
    tx: Transaction,
    actor: AttendanceActor,
    dtos: CreateAttendanceShiftDto[],
    replacing?: typeof attendanceShift.$inferSelect,
  ) {
    const values: (typeof attendanceShift.$inferInsert & {
      id: string;
      dayKind: AttendanceDayKind;
    })[] = [];
    const excludeReplaced = replacing
      ? ne(attendanceShift.id, replacing.id)
      : undefined;
    const employeeIds = [...new Set(dtos.map((dto) => dto.employeeId))];
    const employees = await tx
      .select()
      .from(attendanceEmployee)
      .where(
        and(
          inArray(attendanceEmployee.id, employeeIds),
          eq(attendanceEmployee.organizationId, actor.organizationId),
          eq(attendanceEmployee.enabled, true),
        ),
      );
    const intervals = dtos.map((dto) =>
      parseInterval(dto.startsAt, dto.endsAt),
    );
    const dates = intervals.map(({ startsAt }) => platformDateString(startsAt));
    const years = [...new Set(dates.map((date) => date.slice(0, 4)))];
    const holidays = await tx
      .select({ date: statutoryHoliday.date })
      .from(statutoryHoliday)
      .where(
        and(
          gte(statutoryHoliday.date, `${years[0]}-01-01`),
          lte(statutoryHoliday.date, `${years.at(-1)}-12-31`),
        ),
      );
    if (
      years.some((year) => !holidays.some(({ date }) => date.startsWith(year)))
    )
      throw badRequestError('holidayCalendarMissing');
    const isHoliday = (
      employee: typeof attendanceEmployee.$inferSelect,
      date: string,
    ) =>
      holidays.some((holiday) => holiday.date === date) ||
      employee.indigenousHolidays.includes(date);
    const weekStart = (date: Date) =>
      platformMidnight(date.getTime()) -
      ((toPlatformTime(date).getUTCDay() + 6) % 7) * DAY_MS;
    const scheduledStarts = intervals.map(({ startsAt }) => startsAt);
    const nearbyFrom = Math.min(
      ...scheduledStarts.map((startsAt) =>
        Math.min(
          weekStart(startsAt) - DAY_MS,
          platformMidnight(startsAt.getTime()) -
            MAX_CONSECUTIVE_WORKDAYS * DAY_MS,
        ),
      ),
    );
    const nearbyTo = Math.max(
      ...scheduledStarts.map((startsAt) =>
        Math.max(
          weekStart(startsAt) + 8 * DAY_MS,
          platformMidnight(startsAt.getTime()) +
            (MAX_CONSECUTIVE_WORKDAYS + 1) * DAY_MS,
        ),
      ),
    );
    const agreedHolidays = await loadAgreedHolidays(
      tx,
      employees,
      platformDateString(new Date(nearbyFrom)),
      platformDateString(new Date(nearbyTo)),
    );
    const existingShifts = await tx
      .select({
        employeeId: attendanceShift.employeeId,
        startsAt: attendanceShift.startsAt,
        endsAt: attendanceShift.endsAt,
        breaks: attendanceShift.breaks,
        paidBreak: attendanceShift.paidBreak,
        dayKind: attendanceShift.dayKind,
      })
      .from(attendanceShift)
      .where(
        and(
          inArray(attendanceShift.employeeId, employeeIds),
          ne(attendanceShift.status, 'cancelled'),
          excludeReplaced,
          gte(attendanceShift.startsAt, new Date(nearbyFrom)),
          lt(attendanceShift.startsAt, new Date(nearbyTo)),
        ),
      );
    const from = new Date(
      Math.min(...intervals.map((interval) => interval.startsAt.getTime())),
    );
    const to = new Date(
      Math.max(...intervals.map((interval) => interval.endsAt.getTime())),
    );
    const reservedRest = await tx
      .select()
      .from(attendanceRequest)
      .where(
        and(
          eq(attendanceRequest.organizationId, actor.organizationId),
          inArray(attendanceRequest.employeeId, employeeIds),
          eq(attendanceRequest.status, 'approved'),
          eq(attendanceRequest.kind, 'overtime'),
          sql`(${attendanceRequest.emergency} ->> 'makeupStartsAt')::timestamptz < ${to}`,
          sql`(${attendanceRequest.emergency} ->> 'makeupEndsAt')::timestamptz > ${from}`,
        ),
      );
    const booked = await tx
      .select({
        employeeId: attendanceShift.employeeId,
        startsAt: attendanceShift.startsAt,
        endsAt: attendanceShift.endsAt,
      })
      .from(attendanceShift)
      .where(
        and(
          eq(attendanceShift.organizationId, actor.organizationId),
          inArray(attendanceShift.employeeId, employeeIds),
          ne(attendanceShift.status, 'cancelled'),
          excludeReplaced,
          lt(attendanceShift.startsAt, to),
          sql`${attendanceShift.endsAt} > ${from}`,
        ),
      );
    const bookedLeave = await tx
      .select({
        employeeId: attendanceRequest.employeeId,
        startsAt: attendanceRequest.startsAt,
        endsAt: attendanceRequest.endsAt,
      })
      .from(attendanceRequest)
      .where(
        and(
          eq(attendanceRequest.organizationId, actor.organizationId),
          inArray(attendanceRequest.employeeId, employeeIds),
          eq(attendanceRequest.kind, 'leave'),
          inArray(attendanceRequest.status, blockingRequestStatuses),
          lt(attendanceRequest.startsAt, to),
          sql`${attendanceRequest.endsAt} > ${from}`,
        ),
      );
    const collides = (
      rows: { employeeId: string; startsAt: Date; endsAt: Date }[],
      employeeId: string,
      startsAt: Date,
      endsAt: Date,
    ) =>
      rows.some(
        (row) =>
          row.employeeId === employeeId &&
          row.startsAt < endsAt &&
          row.endsAt > startsAt,
      );
    for (const [index, dto] of dtos.entries()) {
      const interval = intervals[index];
      if (
        interval.endsAt.getTime() - interval.startsAt.getTime() >
        MAX_SHIFT_MS
      )
        throw badRequestError('shiftTooLong');
      const breaks = parseBreaks(interval, dto.breaks);
      const employee = employees.find(({ id }) => id === dto.employeeId);
      if (
        !employee ||
        interval.startsAt < employee.hiredAt ||
        (employee.terminatedAt && interval.endsAt > employee.terminatedAt)
      )
        throw badRequestError('employeeNotEnabled');
      if (
        workPermitRequired(employee.legalStatus) &&
        !withinPeriods(
          employee.workPermits,
          platformDateString(interval.startsAt),
        )
      )
        throw badRequestError('workPermitRequired');
      if (
        maternalNightWork(
          scheduledWorkIntervals({
            ...interval,
            breaks,
            paidBreak: dto.paidBreak,
          }),
          maternalProtectionPeriods(employee),
        )
      )
        throw badRequestError('maternalNightWork');
      const scheduledKind =
        designatedDayKind(employee, weekdayOfDate(dates[index])) ??
        dto.dayKind ??
        (replacing && platformDateString(replacing.startsAt) === dates[index]
          ? replacing.dayKind === 'holiday'
            ? 'workday'
            : replacing.dayKind
          : undefined);
      if (!scheduledKind) throw badRequestError('dayKindRequired');
      if (dto.dayKind && dto.dayKind !== scheduledKind)
        throw badRequestError('restDayDesignationConflict');
      const sameDayKinds = new Set(
        [...existingShifts, ...values]
          .filter(
            (shift) =>
              shift.employeeId === dto.employeeId &&
              platformDateString(shift.startsAt) === dates[index],
          )
          .map((shift) => shift.dayKind),
      );
      const dayKind =
        scheduledKind === 'workday' &&
        (isHoliday(employee, dates[index]) || sameDayKinds.has('holiday'))
          ? 'holiday'
          : scheduledKind;
      if ([...sameDayKinds].some((kind) => kind !== dayKind))
        throw conflictError('inconsistentDayKind');
      await assertPayrollUnlocked(
        tx,
        actor.organizationId,
        dto.employeeId,
        interval.startsAt,
        interval.endsAt,
      );
      if (
        reservedRest.some(
          (request) =>
            request.employeeId === dto.employeeId &&
            request.emergency &&
            interval.startsAt < new Date(request.emergency.makeupEndsAt) &&
            interval.endsAt > new Date(request.emergency.makeupStartsAt),
        )
      )
        throw conflictError('reservedMakeupRest');
      if (collides(booked, dto.employeeId, interval.startsAt, interval.endsAt))
        throw conflictError('overlappingShift');
      if (
        collides(
          bookedLeave,
          dto.employeeId,
          interval.startsAt,
          interval.endsAt,
        )
      )
        throw conflictError('overlappingLeave');
      booked.push({ employeeId: dto.employeeId, ...interval });
      values.push({
        ...dto,
        ...interval,
        dayKind,
        breaks,
        id: randomUUID(),
        organizationId: actor.organizationId,
      });
    }
    for (const employee of employees) {
      const scheduled = values.filter(
        ({ employeeId }) => employeeId === employee.id,
      );
      if (!scheduled.length) continue;
      const scheduledSet = new Set<ScheduledShift>(scheduled);
      const scheduledWeeks = new Set(
        scheduled.map(({ startsAt }) => weekStart(startsAt)),
      );
      const nearby = [
        ...existingShifts.filter(
          ({ employeeId }) => employeeId === employee.id,
        ),
        ...scheduled,
      ];
      const sameWeeks = nearby.filter(({ startsAt }) =>
        scheduledWeeks.has(weekStart(startsAt)),
      );
      if (lacksWeeklyRest(sameWeeks))
        throw badRequestError('weeklyRestRequired');
      const scheduledDates = new Set(
        scheduled.map(({ startsAt }) => platformDateString(startsAt)),
      );
      if (
        exceedsConsecutiveWorkdays(
          agreedWorkdates(nearby, agreedHolidays.get(employee.id) ?? []),
          (date) => scheduledDates.has(date),
        )
      )
        throw badRequestError('consecutiveWorkdaysExceeded');
      if (hasShortRestBetweenShifts(nearby, (shift) => scheduledSet.has(shift)))
        throw badRequestError('shiftRestTooShort');
      const { birthDate } = employee;
      if (
        birthDate &&
        scheduled.some(
          ({ startsAt }) =>
            ageOn(birthDate, platformDateString(startsAt)) < ADULT_WORKING_AGE,
        )
      ) {
        const violation = childLaborViolation(sameWeeks);
        if (violation) throw badRequestError(violation);
      }
      if (
        employee.legalStatus === 'foreignStudent' &&
        exceedsStudentWeeklyLimit(
          sameWeeks.map((shift) => ({
            date: platformDateString(shift.startsAt),
            seconds: scheduledWorkSeconds(shift),
          })),
          employee.studentVacations,
        )
      )
        throw badRequestError('studentWeeklyHoursExceeded');
    }
    return values;
  }

  async cancelShift(actor: AttendanceActor, id: string) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [shift] = await tx
        .select()
        .from(attendanceShift)
        .where(
          and(
            eq(attendanceShift.id, id),
            eq(attendanceShift.organizationId, actor.organizationId),
          ),
        );
      if (!shift) throw new NotFoundException();
      if (shift.status === 'cancelled') return { id };
      await assertShiftWithoutRecords(tx, shift);
      await assertPayrollUnlocked(
        tx,
        actor.organizationId,
        shift.employeeId,
        shift.startsAt,
        shift.endsAt,
      );
      await tx
        .update(attendanceShift)
        .set({ status: 'cancelled' })
        .where(eq(attendanceShift.id, id));
      await writeAudit(tx, actor, 'shift.cancel', id, {});
      return { id };
    });
  }

  async punch(
    actor: AttendanceActor,
    dto: CreateAttendancePunchDto,
    sourceIp: string,
  ) {
    return this.db.transaction(async (tx) => {
      const employee = await requireActiveEmployee(actor, tx);
      await lockEmployee(tx, actor.organizationId, employee.id);
      const [existing] = await tx
        .select()
        .from(attendanceEvent)
        .where(
          and(
            eq(attendanceEvent.organizationId, actor.organizationId),
            eq(attendanceEvent.employeeId, employee.id),
            eq(attendanceEvent.idempotencyKey, dto.idempotencyKey),
          ),
        );
      if (existing) {
        if (existing.shiftId !== dto.shiftId || existing.action !== dto.action)
          throw conflictError('idempotencyConflict');
        return { id: existing.id, occurredAt: existing.occurredAt };
      }
      const [settings] = await tx
        .select()
        .from(attendanceSettings)
        .where(eq(attendanceSettings.organizationId, actor.organizationId));
      if (!settings) throw badRequestError('settingsRequired');
      const ip = normalizeIp(sourceIp);
      if (!settings.allowedIps.some((range) => ipInRange(ip, range)))
        throw forbiddenError('ipNotAllowed');
      const now = new Date();
      const [parentalLeave] = await tx
        .select({ id: attendanceRequest.id })
        .from(attendanceRequest)
        .innerJoin(
          attendanceLeaveType,
          eq(attendanceRequest.leaveTypeId, attendanceLeaveType.id),
        )
        .where(
          and(
            eq(attendanceRequest.organizationId, actor.organizationId),
            eq(attendanceLeaveType.organizationId, actor.organizationId),
            eq(attendanceRequest.employeeId, employee.id),
            eq(attendanceRequest.kind, 'leave'),
            eq(attendanceLeaveType.statutoryKind, 'parental'),
            inArray(attendanceRequest.status, [
              'approved',
              'cancellationPending',
            ]),
            sql`${attendanceRequest.startsAt} <= ${now}`,
            sql`${attendanceRequest.endsAt} > ${now}`,
          ),
        )
        .limit(1);
      if (parentalLeave) throw conflictError('parentalLeaveActive');
      const age = now.getTime() - new Date(dto.locatedAt).getTime();
      if (
        age > 60000 ||
        age < -5000 ||
        distanceMeters(settings, dto) + dto.accuracy > settings.radiusMeters
      )
        throw forbiddenError('locationNotAllowed');
      const [shift] = await tx
        .select()
        .from(attendanceShift)
        .where(
          and(
            eq(attendanceShift.id, dto.shiftId),
            eq(attendanceShift.organizationId, actor.organizationId),
            eq(attendanceShift.employeeId, employee.id),
            ne(attendanceShift.status, 'cancelled'),
          ),
        );
      if (!shift) throw new NotFoundException();
      const events = await tx
        .select()
        .from(attendanceEvent)
        .where(eq(attendanceEvent.shiftId, shift.id))
        .orderBy(asc(attendanceEvent.occurredAt));
      const [corrected] = await tx
        .select({ id: attendanceRequest.id })
        .from(attendanceRequest)
        .where(
          and(
            eq(attendanceRequest.shiftId, shift.id),
            eq(attendanceRequest.kind, 'correction'),
            eq(attendanceRequest.status, 'approved'),
          ),
        )
        .limit(1);
      if (corrected) throw conflictError('shiftHasCorrection');
      if (dto.action === 'clockIn') {
        if (
          now > shift.endsAt ||
          now.getTime() < shift.startsAt.getTime() - punchLeewayMs(shift)
        )
          throw badRequestError('outsideShiftWindow');
        const [active] = await tx
          .select({ id: attendanceShift.id })
          .from(attendanceShift)
          .where(
            and(
              eq(attendanceShift.organizationId, actor.organizationId),
              eq(attendanceShift.employeeId, employee.id),
              ne(attendanceShift.id, shift.id),
              ne(attendanceShift.status, 'cancelled'),
              sql`EXISTS (SELECT 1 FROM ${attendanceEvent} started WHERE started.shift_id = ${attendanceShift.id})`,
              unfinishedShift,
            ),
          )
          .limit(1);
        if (active) throw conflictError('activeShiftExists');
      }
      const ownEvents = events.map(({ action, occurredAt, paidBreak }) => ({
        action,
        occurredAt: occurredAt.toISOString(),
        paidBreak,
      }));
      const { availableActions } = summarizeEvents(ownEvents, shift);
      const last = events.at(-1);
      if (
        !availableActions.includes(dto.action) ||
        (last && last.occurredAt >= now)
      )
        throw badRequestError('invalidEventSequence');
      const [row] = await tx
        .insert(attendanceEvent)
        .values({
          id: randomUUID(),
          organizationId: actor.organizationId,
          employeeId: employee.id,
          shiftId: shift.id,
          action: dto.action,
          occurredAt: now,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracy: dto.accuracy,
          sourceIp: ip,
          paidBreak: shift.paidBreak,
          idempotencyKey: dto.idempotencyKey,
        })
        .returning();
      return { id: row.id, occurredAt: row.occurredAt };
    });
  }
}
