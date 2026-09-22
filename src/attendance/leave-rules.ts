import {
  PLATFORM_UTC_OFFSET_MS,
  platformMidnight,
  platformMonthStart,
  toPlatformTime,
} from 'src/common/constants/timezone';
import type { StatutoryLeaveKind } from 'src/db/schema/attendance';

export function anniversary(hiredAt: Date, months: number) {
  const date = toPlatformTime(hiredAt);
  const first = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), last));
  return new Date(first.getTime() - PLATFORM_UTC_OFFSET_MS);
}

export function annualLeavePeriod(
  hiredAt: Date,
  at: Date,
  weeklyMinutesAt: (at: Date) => number = () => 2400,
) {
  if (at < anniversary(hiredAt, 6)) return null;
  const years =
    toPlatformTime(at).getUTCFullYear() -
    toPlatformTime(hiredAt).getUTCFullYear();
  const completed = at < anniversary(hiredAt, years * 12) ? years - 1 : years;
  const months = completed < 1 ? 6 : completed * 12;
  const days =
    completed < 1
      ? 3
      : completed < 2
        ? 7
        : completed < 3
          ? 10
          : completed < 5
            ? 14
            : completed < 10
              ? 15
              : Math.min(30, completed + 6);
  const start = anniversary(hiredAt, months);

  return {
    start,
    end: anniversary(hiredAt, completed < 1 ? 12 : (completed + 1) * 12),
    minutes: Math.ceil(
      (days * 480 * Math.min(weeklyMinutesAt(start), 2400)) / 2400,
    ),
  };
}

export interface AnnualLeaveLedgerEntry {
  start: Date;
  end: Date;
  minutes: number;
  carriedInMinutes: number;
  usedMinutes: number;
  expiredMinutes: number;
  carryOutMinutes: number;
}

export function annualLeaveLedger(
  hiredAt: Date,
  at: Date,
  weeklyMinutesAt: (at: Date) => number = () => 2400,
  leaves: { startsAt: Date; leaveMinutes: number | null }[] = [],
) {
  const entries: AnnualLeaveLedgerEntry[] = [];
  let carriedInMinutes = 0;
  let period = annualLeavePeriod(
    hiredAt,
    anniversary(hiredAt, 6),
    weeklyMinutesAt,
  );

  while (period && period.start <= at) {
    const { start, end, minutes } = period;
    const usedMinutes = leaves
      .filter((leave) => leave.startsAt >= start && leave.startsAt < end)
      .reduce((sum, leave) => sum + (leave.leaveMinutes ?? 0), 0);
    // 遞延時數先扣，否則它會在期末失效而當期額度還留著
    const fromCarry = Math.min(usedMinutes, carriedInMinutes);
    const carryOutMinutes = Math.max(0, minutes - (usedMinutes - fromCarry));

    entries.push({
      start,
      end,
      minutes,
      carriedInMinutes,
      usedMinutes,
      expiredMinutes: carriedInMinutes - fromCarry,
      carryOutMinutes,
    });
    carriedInMinutes = carryOutMinutes;
    period = annualLeavePeriod(hiredAt, end, weeklyMinutesAt);
  }

  return entries;
}

export function statutoryLeavePeriod(
  kind: StatutoryLeaveKind,
  hiredAt: Date,
  at: Date,
  weeklyMinutesAt: (at: Date) => number = () => 2400,
) {
  if (isEventLeave(kind)) return null;
  if (kind === 'annual') return annualLeavePeriod(hiredAt, at, weeklyMinutesAt);
  const date = toPlatformTime(at),
    year = date.getUTCFullYear(),
    month = date.getUTCMonth();
  const start = platformMonthStart(year, kind === 'menstrual' ? month : 0);
  const end = platformMonthStart(year, kind === 'menstrual' ? month + 1 : 12);
  const days =
    kind === 'personal'
      ? 14
      : kind === 'familyCare'
        ? 7
        : kind === 'sick'
          ? 30
          : kind === 'menstrual'
            ? 1
            : 0;
  return {
    start,
    end,
    minutes: Math.ceil(
      days *
        480 *
        (kind === 'menstrual'
          ? 1
          : Math.min(weeklyMinutesAt(start), 2400) / 2400),
    ),
  };
}

export const statutoryPaidPercent = (kind: StatutoryLeaveKind) =>
  kind === 'annual' ||
  (isEventLeave(kind) &&
    kind !== 'parental' &&
    kind !== 'miscarriage7' &&
    kind !== 'miscarriage5')
    ? 100
    : kind === 'sick' ||
        kind === 'hospitalSick' ||
        kind === 'pregnancyRest' ||
        kind === 'menstrual'
      ? 50
      : 0;

export const effectivePaidPercent = (
  kind: StatutoryLeaveKind,
  override: number | null,
) => Math.max(override ?? 0, statutoryPaidPercent(kind));

export const eventLeaveDays = {
  parental: 731,
  marriage: 8,
  funeral8: 8,
  funeral6: 6,
  funeral3: 3,
  prenatal: 7,
  paternity: 7,
  maternity: 56,
  miscarriage28: 28,
  miscarriage7: 7,
  miscarriage5: 5,
} as const;
export function isEventLeave(
  kind: StatutoryLeaveKind,
): kind is keyof typeof eventLeaveDays {
  return Object.hasOwn(eventLeaveDays, kind);
}

export function requiresMedicalCertificate(kind: StatutoryLeaveKind) {
  return kind === 'hospitalSick' || kind === 'pregnancyRest';
}

export function isCalendarLeave(kind: StatutoryLeaveKind) {
  return [
    'parental',
    'maternity',
    'miscarriage28',
    'miscarriage7',
    'miscarriage5',
  ].includes(kind);
}

export function eventLeaveEntitlement(
  kind: keyof typeof eventLeaveDays,
  hiredAt: Date,
  startsAt: Date,
  weeklyMinutes: number,
) {
  const calendar = isCalendarLeave(kind);
  return {
    grantedMinutes: calendar
      ? eventLeaveDays[kind] * 1440
      : Math.ceil((eventLeaveDays[kind] * 480 * weeklyMinutes) / 2400),
    paidPercent:
      kind === 'parental' || kind === 'miscarriage7' || kind === 'miscarriage5'
        ? 0
        : calendar && startsAt < anniversary(hiredAt, 6)
          ? 50
          : 100,
  };
}

export function calendarLeaveMinutes(startsAt: Date, endsAt: Date) {
  const minutes = (endsAt.getTime() - startsAt.getTime()) / 60000;
  return platformMidnight(startsAt.getTime()) === startsAt.getTime() &&
    minutes > 0 &&
    minutes % 1440 === 0
    ? minutes
    : 0;
}
