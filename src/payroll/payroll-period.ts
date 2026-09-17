import {
  overlapMs,
  scheduledWorkSeconds,
  type ScheduledShift,
  type TimeInterval,
} from 'src/attendance/attendance-rules';
import {
  DAY_MS,
  platformDayNumber,
  platformMidnight,
  toPlatformTime,
} from 'src/common/constants/timezone';

import { roundRatio } from './payroll-calculation';

export const intervalSeconds = (
  interval: TimeInterval,
  from = -Infinity,
  to = Infinity,
) => Math.floor(overlapMs(interval, from, to) / 1000);
export function periodWork(intervals: TimeInterval[], start: Date, end: Date) {
  const sum = (from: number, to: number) =>
    Math.floor(
      intervals.reduce(
        (total, interval) => total + overlapMs(interval, from, to),
        0,
      ) / 1000,
    );
  return {
    seconds: sum(start.getTime(), end.getTime()),
    offsetSeconds: sum(-Infinity, start.getTime()),
    totalSeconds: sum(-Infinity, Infinity),
  };
}

export function employmentPeriod(
  start: Date,
  end: Date,
  hiredAt: Date,
  terminatedAt: Date | null,
  proration: 'thirtyDays' | 'calendarDays' | undefined,
) {
  const day = platformDayNumber;
  const first = Math.max(start.getTime(), hiredAt.getTime());
  const last = Math.min(end.getTime(), terminatedAt?.getTime() ?? Infinity);
  const days = first < last ? day(last - 1) - day(first) + 1 : 0;
  const monthDays = day(end.getTime()) - day(start.getTime());
  const complete = days === monthDays;
  const denominator = complete
    ? 1
    : proration === 'calendarDays'
      ? monthDays
      : 30;
  const numerator = complete ? 1 : Math.min(days, denominator);
  const localNumber = (time: number) =>
    toPlatformTime(new Date(time)).getUTCDate();
  const firstInsuranceDay = Math.min(localNumber(first), 30);
  const lastInsuranceDay =
    day(last - 1) === day(end.getTime() - 1)
      ? 30
      : Math.min(localNumber(last - 1), 30);
  return {
    numerator,
    denominator,
    partial: !complete,
    coverageDays: days
      ? Math.max(0, lastInsuranceDay - firstInsuranceDay + 1)
      : 0,
    healthCharged: days > 0 && day(last - 1) === day(end.getTime() - 1),
  };
}

export function calendarLeavePay(
  leaves: {
    startsAt: Date;
    endsAt: Date;
    leaveCaseId: string | null;
    paidPercent: number | null;
  }[],
  cases: { id: string; dailyPayCents: string | null }[],
  coveredStart: number,
  coveredEnd: number,
) {
  let seconds = 0,
    payCents = 0n,
    missingPay = false;
  for (const leave of leaves) {
    const leaveCase = cases.find((item) => item.id === leave.leaveCaseId);
    if (!leaveCase?.dailyPayCents) {
      missingPay = true;
      continue;
    }
    const leaveSeconds = intervalSeconds(
      { start: leave.startsAt.getTime(), end: leave.endsAt.getTime() },
      coveredStart,
      coveredEnd,
    );
    seconds += leaveSeconds;
    payCents += roundRatio(
      BigInt(leaveCase.dailyPayCents) *
        BigInt(Math.round(leaveSeconds)) *
        BigInt(leave.paidPercent ?? 0),
      86400n * 100n,
    );
  }
  return { seconds, payCents, missingPay };
}

export function exceedsWeeklySchedule(
  shifts: (ScheduledShift & { dayKind: string })[],
  start: Date,
  end: Date,
) {
  const weeks = new Map<number, number>();
  for (const shift of shifts) {
    if (shift.dayKind !== 'workday') continue;
    const weekStart =
      platformMidnight(shift.startsAt.getTime()) -
      ((toPlatformTime(shift.startsAt).getUTCDay() + 6) % 7) * DAY_MS;
    if (weekStart >= end.getTime() || weekStart + 7 * DAY_MS <= start.getTime())
      continue;
    weeks.set(
      weekStart,
      (weeks.get(weekStart) ?? 0) +
        Math.min(scheduledWorkSeconds(shift), 8 * 3600),
    );
  }
  return [...weeks.values()].some((seconds) => seconds > 40 * 3600);
}

export function clipToPeriod<
  T extends { startsAt: Date; endsAt: Date; originalEndsAt: Date | null },
>(request: T, start: Date, end: Date) {
  const startsAt = Math.max(start.getTime(), request.startsAt.getTime());
  const endsAt = Math.min(end.getTime(), request.endsAt.getTime());
  return {
    ...request,
    startsAt: new Date(startsAt),
    endsAt: new Date(Math.max(startsAt, endsAt)),
    originalEndsAt: undefined,
    leaveMinutes: Math.max(0, (endsAt - startsAt) / 60000),
  };
}
