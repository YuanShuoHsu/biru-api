import {
  and,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  lt,
  lte,
  ne,
} from 'drizzle-orm';

import { DAY_MS, platformDateString } from 'src/common/constants/timezone';
import {
  attendanceHolidaySubstitute,
  attendanceLeaveType,
  attendanceRequest,
  attendanceShift,
  statutoryHoliday,
  type attendanceEmployee,
} from 'src/db/schema/attendance';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import type { Transaction } from './attendance-audit';
import {
  employeeHolidays,
  owedHolidaySubstitutes,
  weekdayOfDate,
  weekStartOfDate,
} from './attendance-rules';
import { CALENDAR_LEAVE_KINDS } from './leave-rules';

const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

export async function loadHolidaySubstitutes(
  tx: Transaction | DrizzleDB,
  employees: (typeof attendanceEmployee.$inferSelect)[],
  from: string,
  to: string,
) {
  if (!employees.length)
    return {
      holidays: new Map<string, { date: string; name: string }[]>(),
      owed: new Map<string, string[]>(),
      rows: [] as (typeof attendanceHolidaySubstitute.$inferSelect)[],
    };
  const weekFrom = new Date(weekStartOfDate(from)).toISOString().slice(0, 10);
  const weekTo = shiftDate(
    new Date(weekStartOfDate(to)).toISOString().slice(0, 10),
    7,
  );
  const employeeIds = employees.map(({ id }) => id);
  const [statutory, shifts, rows] = await Promise.all([
    tx
      .select({ date: statutoryHoliday.date, name: statutoryHoliday.name })
      .from(statutoryHoliday)
      .where(
        and(
          gte(statutoryHoliday.date, weekFrom),
          lt(statutoryHoliday.date, weekTo),
        ),
      ),
    tx
      .select({
        id: attendanceShift.id,
        employeeId: attendanceShift.employeeId,
        startsAt: attendanceShift.startsAt,
        dayKind: attendanceShift.dayKind,
      })
      .from(attendanceShift)
      .where(
        and(
          inArray(attendanceShift.employeeId, employeeIds),
          ne(attendanceShift.status, 'cancelled'),
          gte(attendanceShift.startsAt, new Date(`${weekFrom}T00:00:00+08:00`)),
          lt(attendanceShift.startsAt, new Date(`${weekTo}T00:00:00+08:00`)),
        ),
      ),
    tx
      .select(getTableColumns(attendanceHolidaySubstitute))
      .from(attendanceHolidaySubstitute)
      .innerJoin(
        attendanceShift,
        eq(attendanceShift.id, attendanceHolidaySubstitute.shiftId),
      )
      .where(
        and(
          inArray(attendanceHolidaySubstitute.employeeId, employeeIds),
          ne(attendanceShift.status, 'cancelled'),
          gte(attendanceHolidaySubstitute.holidayDate, from),
          lte(attendanceHolidaySubstitute.holidayDate, to),
        ),
      ),
  ]);
  const substituteShiftIds = new Set(
    (
      await tx
        .select({ shiftId: attendanceHolidaySubstitute.shiftId })
        .from(attendanceHolidaySubstitute)
        .where(inArray(attendanceHolidaySubstitute.employeeId, employeeIds))
    ).map(({ shiftId }) => shiftId),
  );
  const owed = new Map<string, string[]>();
  const holidays = new Map<string, { date: string; name: string }[]>();
  for (const employee of employees) {
    const own = employeeHolidays(statutory, employee).filter(
      ({ date }) => date >= weekFrom && date < weekTo,
    );
    holidays.set(employee.id, own);
    owed.set(
      employee.id,
      owedHolidaySubstitutes({
        employedFrom: platformDateString(employee.hiredAt),
        employedUntil: employee.terminatedAt
          ? platformDateString(employee.terminatedAt)
          : null,
        holidays: own,
        restWeekdays:
          employee.regularLeaveWeekday === null ||
          employee.restDayWeekday === null
            ? null
            : [employee.regularLeaveWeekday, employee.restDayWeekday],
        shifts: shifts.filter((shift) => shift.employeeId === employee.id),
        substituteShiftIds,
      }).filter((date) => date >= from && date <= to),
    );
  }
  return { holidays, owed, rows };
}

const platformDayStart = (date: string) =>
  new Date(`${date}T00:00:00+08:00`).getTime();

export async function loadAgreedHolidays(
  tx: Transaction | DrizzleDB,
  employees: (typeof attendanceEmployee.$inferSelect)[],
  from: string,
  to: string,
) {
  if (!employees.length) return new Map<string, string[]>();
  const [statutory, calendarLeaves] = await Promise.all([
    tx
      .select({ date: statutoryHoliday.date, name: statutoryHoliday.name })
      .from(statutoryHoliday)
      .where(
        and(gte(statutoryHoliday.date, from), lt(statutoryHoliday.date, to)),
      ),
    tx
      .select({
        employeeId: attendanceRequest.employeeId,
        startsAt: attendanceRequest.startsAt,
        endsAt: attendanceRequest.endsAt,
      })
      .from(attendanceRequest)
      .innerJoin(
        attendanceLeaveType,
        eq(attendanceLeaveType.id, attendanceRequest.leaveTypeId),
      )
      .where(
        and(
          inArray(
            attendanceRequest.employeeId,
            employees.map(({ id }) => id),
          ),
          eq(attendanceRequest.kind, 'leave'),
          eq(attendanceRequest.status, 'approved'),
          inArray(attendanceLeaveType.statutoryKind, CALENDAR_LEAVE_KINDS),
          lt(attendanceRequest.startsAt, new Date(platformDayStart(to))),
          gt(attendanceRequest.endsAt, new Date(platformDayStart(from))),
        ),
      ),
  ]);

  return new Map(
    employees.map((employee) => {
      const employedFrom = platformDateString(employee.hiredAt);
      const employedUntil =
        employee.terminatedAt && platformDateString(employee.terminatedAt);
      const restWeekdays = [
        employee.regularLeaveWeekday,
        employee.restDayWeekday,
      ];
      const onCalendarLeave = (date: string) =>
        calendarLeaves.some(
          (leave) =>
            leave.employeeId === employee.id &&
            leave.startsAt.getTime() < platformDayStart(date) + DAY_MS &&
            leave.endsAt.getTime() > platformDayStart(date),
        );
      return [
        employee.id,
        employeeHolidays(statutory, employee)
          .map(({ date }) => date)
          .filter(
            (date) =>
              date >= from &&
              date < to &&
              date >= employedFrom &&
              (!employedUntil || date < employedUntil) &&
              !restWeekdays.includes(weekdayOfDate(date)) &&
              !onCalendarLeave(date),
          ),
      ];
    }),
  );
}
