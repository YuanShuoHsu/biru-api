import {
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
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
  type ShiftBreak,
  statutoryHoliday,
} from 'src/db/schema/attendance';
import { team, teamMember } from 'src/db/schema/organizations';
import { payrollStatement } from 'src/db/schema/payroll';
import { user } from 'src/db/schema/users';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';
import {
  DAY_MS,
  platformDateString,
  platformMidnight,
  PLATFORM_TIMEZONE,
  STORE_UTC_OFFSET,
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
  attendanceIncomplete,
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
  OVERTIME_REVIEW_MIN_MS,
  punchLeewayMs,
  countedIntervals,
  maternalNightWork,
  maternalProtectionPeriods,
  designatedDayKind,
  employeeHolidays,
  weekdayOfDate,
  type ScheduledShift,
  scheduledLeaveSeconds,
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
import {
  ATTENDANCE_COPY_SKIP_REASONS,
  type AttendanceCopySkipReason,
  CopyAttendanceWeekDto,
} from './dto/copy-attendance-week.dto';
import { CreateAttendancePunchDto } from './dto/create-attendance-punch.dto';
import {
  CreateAttendanceShiftDto,
  UpdateAttendanceShiftDto,
} from './dto/create-attendance-shifts.dto';
import { requireActiveEmployee, requireEmployee } from './employee-lookup';
import {
  loadAgreedHolidays,
  loadHolidaySubstitutes,
} from './holiday-substitutes';
import {
  loadPlannedOvertimeInputs,
  overtimeLimitViolation,
  overtimeOutsideShiftSeconds,
  plannedWorkDays,
} from './overtime-limit';
import { parseInterval, scheduledBreaks } from './shift-intervals';
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

const shiftMonth = (time: SQL | typeof attendanceShift.startsAt) =>
  sql`to_char((${time}) AT TIME ZONE ${PLATFORM_TIMEZONE}, 'YYYY-MM')`;

const overtimeReviewMin = sql.raw(
  `interval '${OVERTIME_REVIEW_MIN_MS} milliseconds'`,
);

// 須是 unreviewedOvertime 可能非空的超集合：沒有休息打卡時採計時段不會超出上下班區間，區間內的未付休息也同時從排定時段扣除
const mayHaveUnreviewedOvertime = sql`(
  ${clockInAt} <= ${attendanceShift.startsAt} - ${overtimeReviewMin}
  OR ${clockOutAt} >= ${attendanceShift.endsAt} + ${overtimeReviewMin}
  OR (${approvedCorrectedEvents} IS NULL AND EXISTS (SELECT 1 FROM ${attendanceEvent} rest
    WHERE rest.shift_id = ${attendanceShift.id} AND rest.action = 'breakStart'))
)`;

const payrollUnpublished = sql`NOT EXISTS (SELECT 1 FROM ${payrollStatement} published
  WHERE published.employee_id = ${attendanceShift.employeeId}
    AND published.status = 'published'
    AND published.month IN (${shiftMonth(attendanceShift.startsAt)},
      ${shiftMonth(sql`${attendanceShift.endsAt} - interval '1 millisecond'`)}))`;

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
      employeeEmail: user.email,
      teamName: team.name,
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
          ilike(user.email, `%${value}%`),
          ilike(team.name, `%${value}%`),
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
          employeeEmail: user.email,
          teamName: team.name,
          clockInAt,
          clockOutAt,
        })
        .from(attendanceShift)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceShift.employeeId),
        )
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .leftJoin(team, eq(team.id, attendanceShift.teamId))
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
        .leftJoin(team, eq(team.id, attendanceShift.teamId))
        .where(where),
    ]);
    if (!rows.length) return { data: [], total };
    const ids = rows.map((row) => row.shift.id);
    const [events, corrections, overtime, [settings], leaves] =
      await Promise.all([
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
        this.db
          .select({
            employeeId: attendanceRequest.employeeId,
            startsAt: attendanceRequest.startsAt,
            endsAt: attendanceRequest.endsAt,
          })
          .from(attendanceRequest)
          .where(
            and(
              eq(attendanceRequest.organizationId, actor.organizationId),
              inArray(
                attendanceRequest.employeeId,
                rows.map((row) => row.shift.employeeId),
              ),
              eq(attendanceRequest.kind, 'leave'),
              eq(attendanceRequest.status, 'approved'),
              lt(
                attendanceRequest.startsAt,
                new Date(
                  Math.max(...rows.map((row) => row.shift.endsAt.getTime())),
                ),
              ),
              gt(
                attendanceRequest.endsAt,
                new Date(
                  Math.min(...rows.map((row) => row.shift.startsAt.getTime())),
                ),
              ),
            ),
          ),
      ]);
    const now = Date.now();
    const data = rows.map((row) => {
      const {
        shift,
        employeeName,
        employeeEmail,
        teamName,
        clockInAt,
        clockOutAt,
      } = row;
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
      const incomplete = attendanceIncomplete({
        dayKind: shift.dayKind,
        leaveSeconds: scheduledLeaveSeconds(
          shift,
          leaves.filter((leave) => leave.employeeId === shift.employeeId),
        ),
        state: summary.state,
        workSeconds: scheduledWorkSeconds(shift),
      });
      return {
        ...shift,
        employeeName,
        employeeEmail,
        teamName,
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
        absent:
          incomplete &&
          summary.state === 'scheduled' &&
          now > shift.endsAt.getTime(),
        missingClockOut:
          incomplete &&
          summary.state !== 'scheduled' &&
          now > shift.endsAt.getTime() + punchLeewayMs(shift),
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

  async unreviewedOvertimeShiftIds(actor: AttendanceActor, scope?: SQL) {
    const ids: string[] = [];
    let loaded = 0;
    let total: number;
    do {
      const page = await this.shifts(
        actor,
        {
          limit: CALENDAR_SHIFT_LIMIT,
          offset: loaded,
          sortBy: 'startsAt',
          sortDirection: 'asc',
        },
        false,
        and(
          sql`NOT (${unfinishedShift})`,
          mayHaveUnreviewedOvertime,
          payrollUnpublished,
          scope,
        ),
      );
      ids.push(
        ...page.data
          .filter((shift) => shift.unreviewedOvertime.length)
          .map((shift) => shift.id),
      );
      loaded += page.data.length;
      total = page.total;
      if (!page.data.length) break;
    } while (loaded < total);
    return ids;
  }

  async unreviewedOvertimeShifts(
    actor: AttendanceActor,
    query: AttendanceShiftPaginationQueryDto,
  ) {
    const ids = await this.unreviewedOvertimeShiftIds(actor);
    if (!ids.length) return { data: [], total: 0 };
    return this.shifts(actor, query, false, inArray(attendanceShift.id, ids));
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

  async teams(actor: AttendanceActor) {
    const [teams, memberships] = await Promise.all([
      this.db
        .select({ id: team.id, name: team.name })
        .from(team)
        .where(eq(team.organizationId, actor.organizationId))
        .orderBy(asc(team.name), asc(team.id)),
      this.db
        .select({
          teamId: teamMember.teamId,
          employeeId: attendanceEmployee.id,
        })
        .from(teamMember)
        .innerJoin(team, eq(team.id, teamMember.teamId))
        .innerJoin(
          attendanceEmployee,
          and(
            eq(attendanceEmployee.userId, teamMember.userId),
            eq(attendanceEmployee.organizationId, team.organizationId),
          ),
        )
        .where(eq(team.organizationId, actor.organizationId)),
    ]);
    return teams.map((row) => ({
      ...row,
      employeeIds: memberships
        .filter(({ teamId }) => teamId === row.id)
        .map(({ employeeId }) => employeeId),
    }));
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
          and(eq(attendanceEmployee.organizationId, actor.organizationId)),
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
    const substitutes = await loadHolidaySubstitutes(
      this.db,
      employees.map(({ employee }) => employee),
      fromDate,
      platformDateString(new Date(new Date(to).getTime() - 1)),
    );
    const pendingSubstitutes = employees.flatMap(({ employee, employeeName }) =>
      (substitutes.owed.get(employee.id) ?? [])
        .filter(
          (date) =>
            !substitutes.rows.some(
              (row) =>
                row.employeeId === employee.id && row.holidayDate === date,
            ),
        )
        .map((date) => ({
          employeeId: employee.id,
          employeeName,
          date,
          holidayName:
            substitutes.holidays
              .get(employee.id)
              ?.find((holiday) => holiday.date === date)?.name ?? '',
        })),
    );
    return { holidays: statutory, dayKinds, pendingSubstitutes };
  }

  async createShifts(
    actor: AttendanceActor,
    dtos: CreateAttendanceShiftDto[],
    dryRun = false,
  ) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const values = await this.prepareShifts(tx, actor, dtos);
      if (dryRun)
        return values.map((value) => ({
          ...value,
          status: 'scheduled' as const,
          createdAt: new Date(),
        }));
      return this.insertShifts(
        tx,
        actor,
        values,
        dtos as unknown as Record<string, unknown>[],
      );
    });
  }

  async copyWeek(
    actor: AttendanceActor,
    { from, weeks, dryRun = false }: CopyAttendanceWeekDto,
  ) {
    const sourceStart = new Date(`${from}T00:00:00${STORE_UTC_OFFSET}`);
    if (!Number.isFinite(sourceStart.getTime()))
      throw badRequestError('invalidInterval');
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const source = await tx
        .select({
          shift: attendanceShift,
          employee: attendanceEmployee,
          employeeName: user.name,
        })
        .from(attendanceShift)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceShift.employeeId),
        )
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(
          and(
            eq(attendanceShift.organizationId, actor.organizationId),
            ne(attendanceShift.status, 'cancelled'),
            gte(attendanceShift.startsAt, sourceStart),
            lt(
              attendanceShift.startsAt,
              new Date(sourceStart.getTime() + 7 * DAY_MS),
            ),
          ),
        )
        .orderBy(asc(attendanceShift.startsAt), asc(attendanceShift.id));
      const copies = Array.from({ length: weeks }, (_, week) =>
        source.map((row) => ({ ...row, offset: (week + 1) * 7 * DAY_MS })),
      ).flat();
      const dtos = copies.map(
        ({ shift, employee, offset }): CreateAttendanceShiftDto => {
          const move = (date: Date | string) =>
            new Date(new Date(date).getTime() + offset).toISOString();
          return {
            employeeId: shift.employeeId,
            teamId: shift.teamId,
            startsAt: move(shift.startsAt),
            endsAt: move(shift.endsAt),
            dayKind: designatedDayKind(
              employee,
              weekdayOfDate(platformDateString(shift.startsAt)),
            )
              ? undefined
              : shift.dayKind === 'holiday'
                ? 'workday'
                : shift.dayKind,
          };
        },
      );
      const skipped = new Map<number, AttendanceCopySkipReason>();
      const values = dtos.length
        ? await this.prepareShifts(
            tx,
            actor,
            dtos,
            undefined,
            (index, reason) => skipped.set(index, reason),
          )
        : [];
      const createdIndexes = [...dtos.keys()].filter(
        (index) => !skipped.has(index),
      );
      if (!dryRun && values.length)
        await this.insertShifts(
          tx,
          actor,
          values,
          createdIndexes.map((index) => ({
            ...dtos[index],
            sourceShiftId: copies[index].shift.id,
          })),
        );
      const summary = (index: number) => ({
        sourceShiftId: copies[index].shift.id,
        employeeId: dtos[index].employeeId,
        employeeName: copies[index].employeeName,
        startsAt: dtos[index].startsAt,
        endsAt: dtos[index].endsAt,
      });
      return {
        created: createdIndexes.map((index, position) => ({
          ...summary(index),
          ...(!dryRun && { id: values[position].id }),
        })),
        skipped: [...skipped].map(([index, reason]) => ({
          ...summary(index),
          reason,
        })),
      };
    });
  }

  private async insertShifts(
    tx: Transaction,
    actor: AttendanceActor,
    values: Awaited<ReturnType<typeof this.prepareShifts>>,
    changes: Record<string, unknown>[],
  ) {
    const rows = await tx.insert(attendanceShift).values(values).returning();
    await writeAudits(
      tx,
      actor,
      'shift.create',
      values.map((value, index) => ({
        resourceId: value.id,
        changes: changes[index],
      })),
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return values.map((value) => byId.get(value.id)!);
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
      const { dryRun, ...change } = dto;
      const [value] = await this.prepareShifts(
        tx,
        actor,
        [
          {
            ...change,
            employeeId: change.employeeId ?? shift.employeeId,
            teamId: change.teamId === undefined ? shift.teamId : change.teamId,
          },
        ],
        shift,
      );
      const {
        employeeId,
        teamId,
        startsAt,
        endsAt,
        breaks,
        paidBreak,
        dayKind,
      } = value;
      if (dryRun)
        return {
          ...shift,
          employeeId,
          teamId,
          startsAt,
          endsAt,
          breaks,
          paidBreak,
          dayKind,
        };
      const [row] = await tx
        .update(attendanceShift)
        .set({
          employeeId,
          teamId,
          startsAt,
          endsAt,
          breaks,
          paidBreak,
          dayKind,
        })
        .where(eq(attendanceShift.id, id))
        .returning();
      await writeAudit(tx, actor, 'shift.update', id, {
        before: {
          employeeId: shift.employeeId,
          teamId: shift.teamId,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          breaks: shift.breaks,
          paidBreak: shift.paidBreak,
          dayKind: shift.dayKind,
        },
        after: {
          employeeId,
          teamId,
          startsAt,
          endsAt,
          breaks,
          paidBreak,
          dayKind,
        },
      });
      return row;
    });
  }

  private async prepareShifts(
    tx: Transaction,
    actor: AttendanceActor,
    dtos: CreateAttendanceShiftDto[],
    replacing?: typeof attendanceShift.$inferSelect,
    skip?: (index: number, reason: AttendanceCopySkipReason) => void,
  ) {
    const values: (typeof attendanceShift.$inferInsert & {
      id: string;
      teamId: string | null;
      dayKind: AttendanceDayKind;
      paidBreak: boolean;
      breaks: ShiftBreak[];
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
        ),
      );
    const teamIds = [...new Set(dtos.flatMap(({ teamId }) => teamId ?? []))];
    const teamMemberships = teamIds.length
      ? await tx
          .select({ teamId: teamMember.teamId, userId: teamMember.userId })
          .from(teamMember)
          .innerJoin(team, eq(team.id, teamMember.teamId))
          .where(
            and(
              inArray(teamMember.teamId, teamIds),
              eq(team.organizationId, actor.organizationId),
            ),
          )
      : [];
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
        id: attendanceShift.id,
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
    const existingShiftIds = existingShifts.map(({ id }) => id);
    const existingOvertime = existingShiftIds.length
      ? await tx
          .select({
            shiftId: attendanceRequest.shiftId,
            startsAt: attendanceRequest.startsAt,
            endsAt: attendanceRequest.endsAt,
          })
          .from(attendanceRequest)
          .where(
            and(
              inArray(attendanceRequest.shiftId, existingShiftIds),
              eq(attendanceRequest.kind, 'overtime'),
              inArray(attendanceRequest.status, blockingRequestStatuses),
            ),
          )
      : [];
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
      try {
        const interval = intervals[index];
        if (
          interval.endsAt.getTime() - interval.startsAt.getTime() >
          MAX_SHIFT_MS
        )
          throw badRequestError('shiftTooLong');
        const breaks = scheduledBreaks(interval);
        const employee = employees.find(({ id }) => id === dto.employeeId);
        if (
          !employee ||
          interval.startsAt < employee.hiredAt ||
          (employee.terminatedAt && interval.endsAt > employee.terminatedAt)
        )
          throw badRequestError('employeeNotEnabled');
        if (
          dto.teamId &&
          !teamMemberships.some(
            ({ teamId, userId }) =>
              teamId === dto.teamId && userId === employee.userId,
          )
        )
          throw badRequestError('employeeNotInTeam');
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
              paidBreak: false,
            }),
            maternalProtectionPeriods(employee),
          )
        )
          throw badRequestError('maternalNightWork');
        const scheduledKind =
          designatedDayKind(employee, weekdayOfDate(dates[index])) ??
          dto.dayKind ??
          (replacing &&
          replacing.employeeId === dto.employeeId &&
          platformDateString(replacing.startsAt) === dates[index]
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
        if (skip && dayKind !== 'workday') {
          skip(index, dayKind);
          continue;
        }
        if ([...sameDayKinds].some((kind) => kind !== dayKind))
          throw conflictError('inconsistentDayKind');
        if (
          dayKind !== 'regularLeave' &&
          [...existingShifts, ...values]
            .filter(
              (shift) =>
                shift.employeeId === dto.employeeId &&
                platformDateString(shift.startsAt) === dates[index],
            )
            .reduce(
              (seconds, shift) =>
                seconds +
                scheduledWorkSeconds(shift) +
                overtimeOutsideShiftSeconds(shift, existingOvertime),
              scheduledWorkSeconds({
                ...interval,
                breaks,
                paidBreak: false,
              }),
            ) > MAX_DAILY_WORK_SECONDS
        )
          throw badRequestError('scheduledDailyHoursExceeded');
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
        if (
          collides(booked, dto.employeeId, interval.startsAt, interval.endsAt)
        )
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
          teamId: dto.teamId ?? null,
          dayKind,
          breaks,
          paidBreak: false,
          id: randomUUID(),
          organizationId: actor.organizationId,
        });
      } catch (error) {
        const reason = ATTENDANCE_COPY_SKIP_REASONS.find(
          (code) => error instanceof HttpException && error.message === code,
        );
        if (!skip || !reason) throw error;
        skip(index, reason);
      }
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
      const scheduledMonths = new Set(
        scheduled.map(({ startsAt }) =>
          platformDateString(startsAt).slice(0, 7),
        ),
      );
      const planned = await loadPlannedOvertimeInputs(
        tx,
        actor.organizationId,
        employee.id,
        scheduledMonths,
        replacing?.id,
      );
      const overtimeViolation = overtimeLimitViolation(
        plannedWorkDays([...planned.shifts, ...scheduled], planned.overtime),
        planned.limits,
        scheduledMonths,
      );
      if (overtimeViolation) throw badRequestError(overtimeViolation);
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

  async cancelShift(actor: AttendanceActor, id: string, rawReason = '') {
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
      const reason = rawReason.trim();
      if (shift.startsAt <= new Date() && !reason)
        throw badRequestError('cancelReasonRequired');
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
      await writeAudit(tx, actor, 'shift.cancel', id, reason ? { reason } : {});
      return { id };
    });
  }

  async restoreShift(actor: AttendanceActor, id: string) {
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
      if (shift.status !== 'cancelled') return { id };
      const [{ breaks, dayKind }] = await this.prepareShifts(
        tx,
        actor,
        [
          {
            employeeId: shift.employeeId,
            teamId: shift.teamId,
            startsAt: shift.startsAt.toISOString(),
            endsAt: shift.endsAt.toISOString(),
          },
        ],
        shift,
      );
      await tx
        .update(attendanceShift)
        .set({ status: 'scheduled', breaks, dayKind })
        .where(eq(attendanceShift.id, id));
      await writeAudit(tx, actor, 'shift.restore', id, {});
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
