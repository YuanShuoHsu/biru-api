import type { AttendanceErrorCode } from './attendance-errors';
import { overlapMs } from './attendance-rules';
import { anniversary, calendarLeaveMinutes } from './leave-rules';

export interface ParentalRecord {
  id: string;
  leaveCaseId: string;
  startsAt: Date;
  endsAt: Date;
  parentalMode: 'daily' | 'continuous' | null;
  originalEndsAt?: Date | null;
}

export interface ParentalCase {
  id: string;
  eventDate: Date;
  childId?: string | null;
}

export function parentalLeaveErrors(
  records: ParentalRecord[],
  cases: ParentalCase[],
) {
  const errors = new Set<AttendanceErrorCode>();
  for (const record of records) {
    const child = cases.find((item) => item.id === record.leaveCaseId);
    const minutes = calendarLeaveMinutes(record.startsAt, record.endsAt);
    if (
      !child ||
      record.startsAt < child.eventDate ||
      record.endsAt > anniversary(child.eventDate, 36) ||
      !minutes
    ) {
      errors.add('invalidParentalInterval');
      continue;
    }
    if (
      !record.parentalMode ||
      (record.parentalMode === 'daily'
        ? minutes > 30 * 1440
        : calendarLeaveMinutes(
            record.startsAt,
            record.originalEndsAt ?? record.endsAt,
          ) <
          30 * 1440)
    )
      errors.add('invalidParentalInterval');
  }
  const children = [
    ...new Map(cases.map((item) => [item.childId ?? item.id, item])).values(),
  ];
  for (const child of children) {
    const caseIds = new Set(
      cases
        .filter(
          (item) => (item.childId ?? item.id) === (child.childId ?? child.id),
        )
        .map((item) => item.id),
    );
    const leaves = records
      .filter((record) => caseIds.has(record.leaveCaseId))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    if (!leaves.length) continue;
    const days = leaves.reduce(
      (sum, record) =>
        sum + calendarLeaveMinutes(record.startsAt, record.endsAt),
      0,
    );
    const maximum =
      (anniversary(leaves[0].startsAt, 24).getTime() -
        leaves[0].startsAt.getTime()) /
      60000;
    if (days > maximum) errors.add('parentalTotalLimit');
    const daily = leaves
      .filter((record) => record.parentalMode === 'daily')
      .reduce(
        (sum, record) =>
          sum + calendarLeaveMinutes(record.startsAt, record.endsAt),
        0,
      );
    if (daily > 30 * 1440) errors.add('parentalDailyLimit');
    if (
      leaves.filter(
        (record) =>
          record.parentalMode === 'continuous' &&
          (record.originalEndsAt ?? record.endsAt) <
            anniversary(record.startsAt, 6),
      ).length > 2
    )
      errors.add('parentalShortLimit');
    const born = child.eventDate.getTime(),
      until = anniversary(child.eventDate, 36).getTime();
    const overlapping = records
      .map((record) => ({
        start: Math.max(born, record.startsAt.getTime()),
        end: Math.min(until, record.endsAt.getTime()),
      }))
      .filter((interval) => interval.end > interval.start);
    if (overlapping.length) {
      const first = Math.min(...overlapping.map((interval) => interval.start));
      const total = overlapping.reduce(
        (sum, interval) => sum + interval.end - interval.start,
        0,
      );
      const youngerBirth = cases
        .filter((item) => item.eventDate > child.eventDate)
        .map((item) => item.eventDate.getTime());
      const nextBirth = Math.min(until, ...youngerBirth);
      const beforeNext = overlapping.reduce(
        (sum, interval) => sum + overlapMs(interval, -Infinity, nextBirth),
        0,
      );
      if (
        (nextBirth === until ? total : beforeNext) >
        anniversary(new Date(first), 24).getTime() - first
      )
        errors.add('parentalTotalLimit');
    }
  }
  return [...errors];
}
