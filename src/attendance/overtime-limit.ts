import { and, eq, gte, inArray, lt, ne } from 'drizzle-orm';

import {
  platformDateString,
  platformMonthStart,
} from 'src/common/constants/timezone';
import {
  attendanceRequest,
  attendanceSettings,
  attendanceShift,
  type AttendanceDayKind,
} from 'src/db/schema/attendance';

import type { Transaction } from './attendance-audit';
import {
  blockingRequestStatuses,
  EXTENDED_MONTHLY_OVERTIME_SECONDS,
  EXTENDED_PERIOD_OVERTIME_SECONDS,
  MAX_MONTHLY_OVERTIME_SECONDS,
  overlapMs,
  OVERTIME_EXTENSION_MONTHS,
  overtimeExtensionPeriodOf,
  scheduledWorkSeconds,
  type ScheduledShift,
} from './attendance-rules';

const NORMAL_DAILY_SECONDS = 8 * 3600;

type PlannedShift = ScheduledShift & { id: string; dayKind: AttendanceDayKind };

interface PlannedOvertime {
  shiftId: string | null;
  startsAt: Date;
  endsAt: Date;
}

// §36 III 休息日全數計入；國定假日、特休與平日只計超過 8 小時的部分；§40 例假日不計
export const countedOvertimeSeconds = ({
  dayKind,
  seconds,
}: {
  dayKind: AttendanceDayKind;
  seconds: number;
}) =>
  dayKind === 'restDay'
    ? seconds
    : dayKind === 'regularLeave'
      ? 0
      : Math.max(0, seconds - NORMAL_DAILY_SECONDS);

export const overtimeOutsideShiftSeconds = (
  shift: { id: string; startsAt: Date; endsAt: Date },
  overtime: PlannedOvertime[],
) =>
  Math.floor(
    overtime
      .filter(({ shiftId }) => shiftId === shift.id)
      .reduce((ms, request) => {
        const interval = {
          start: request.startsAt.getTime(),
          end: request.endsAt.getTime(),
        };
        return (
          ms +
          interval.end -
          interval.start -
          overlapMs(interval, shift.startsAt.getTime(), shift.endsAt.getTime())
        );
      }, 0) / 1000,
  );

export const plannedWorkDays = (
  shifts: PlannedShift[],
  overtime: PlannedOvertime[],
) => {
  const days = new Map<
    string,
    { dayKind: AttendanceDayKind; seconds: number }
  >();
  for (const shift of shifts) {
    const date = platformDateString(shift.startsAt);
    days.set(date, {
      dayKind: shift.dayKind,
      seconds:
        (days.get(date)?.seconds ?? 0) +
        scheduledWorkSeconds(shift) +
        overtimeOutsideShiftSeconds(shift, overtime),
    });
  }
  return [...days].map(([date, day]) => ({ date, ...day }));
};

const monthKey = (year: number, monthIndex: number) =>
  platformDateString(platformMonthStart(year, monthIndex)).slice(0, 7);

const monthWindow = (month: string, periods: string[]) => {
  const [year, number] = month.split('-').map(Number);
  const period = overtimeExtensionPeriodOf(periods, year, number - 1);
  const first = period ?? { year, monthIndex: number - 1 };
  return {
    period,
    months: Array.from(
      { length: period ? OVERTIME_EXTENSION_MONTHS : 1 },
      (_, index) => monthKey(first.year, first.monthIndex + index),
    ),
  };
};

export const overtimeBeforeAgreement = (
  days: { date: string; dayKind: AttendanceDayKind; seconds: number }[],
  agreedFrom: string | null,
) =>
  days.some(
    (day) =>
      countedOvertimeSeconds(day) > 0 &&
      (agreedFrom === null || day.date < agreedFrom),
  );

export function overtimeLimitViolation(
  days: { date: string; dayKind: AttendanceDayKind; seconds: number }[],
  { agreedFrom, periods }: { agreedFrom: string | null; periods: string[] },
  months: Iterable<string>,
) {
  const checkedMonths = [...months];
  if (
    overtimeBeforeAgreement(
      days.filter((day) => checkedMonths.includes(day.date.slice(0, 7))),
      agreedFrom,
    )
  )
    return 'overtimeAgreementRequired' as const;
  const byMonth = new Map<string, number>();
  for (const day of days) {
    const month = day.date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + countedOvertimeSeconds(day));
  }
  for (const month of checkedMonths) {
    const window = monthWindow(month, periods);
    if (
      (byMonth.get(month) ?? 0) >
      (window.period
        ? EXTENDED_MONTHLY_OVERTIME_SECONDS
        : MAX_MONTHLY_OVERTIME_SECONDS)
    )
      return 'monthlyOvertimeExceeded' as const;
    if (
      window.period &&
      window.months.reduce((sum, key) => sum + (byMonth.get(key) ?? 0), 0) >
        EXTENDED_PERIOD_OVERTIME_SECONDS
    )
      return 'periodOvertimeExceeded' as const;
  }
  return null;
}

export async function loadPlannedOvertimeInputs(
  tx: Transaction,
  organizationId: string,
  employeeId: string,
  months: Iterable<string>,
  excludedShiftId?: string,
) {
  const [settings] = await tx
    .select({
      agreedFrom: attendanceSettings.overtimeAgreedFrom,
      periods: attendanceSettings.overtimeExtensionPeriods,
    })
    .from(attendanceSettings)
    .where(eq(attendanceSettings.organizationId, organizationId));
  const periods = settings?.periods ?? [];
  const agreedFrom = settings?.agreedFrom ?? null;
  const keys = [...months].flatMap(
    (month) => monthWindow(month, periods).months,
  );
  const [firstYear, firstMonth] = keys
    .reduce((min, key) => (key < min ? key : min))
    .split('-')
    .map(Number);
  const [lastYear, lastMonth] = keys
    .reduce((max, key) => (key > max ? key : max))
    .split('-')
    .map(Number);
  const shifts = await tx
    .select({
      id: attendanceShift.id,
      startsAt: attendanceShift.startsAt,
      endsAt: attendanceShift.endsAt,
      breaks: attendanceShift.breaks,
      paidBreak: attendanceShift.paidBreak,
      dayKind: attendanceShift.dayKind,
    })
    .from(attendanceShift)
    .where(
      and(
        eq(attendanceShift.organizationId, organizationId),
        eq(attendanceShift.employeeId, employeeId),
        ne(attendanceShift.status, 'cancelled'),
        excludedShiftId ? ne(attendanceShift.id, excludedShiftId) : undefined,
        gte(
          attendanceShift.startsAt,
          platformMonthStart(firstYear, firstMonth - 1),
        ),
        lt(attendanceShift.startsAt, platformMonthStart(lastYear, lastMonth)),
      ),
    );
  const overtime = shifts.length
    ? await tx
        .select({
          shiftId: attendanceRequest.shiftId,
          startsAt: attendanceRequest.startsAt,
          endsAt: attendanceRequest.endsAt,
        })
        .from(attendanceRequest)
        .where(
          and(
            inArray(
              attendanceRequest.shiftId,
              shifts.map(({ id }) => id),
            ),
            eq(attendanceRequest.kind, 'overtime'),
            inArray(attendanceRequest.status, blockingRequestStatuses),
          ),
        )
    : [];
  return { limits: { agreedFrom, periods }, shifts, overtime };
}
