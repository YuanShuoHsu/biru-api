import { and, eq, gt, inArray, lt, ne } from 'drizzle-orm';

import {
  DAY_MS,
  platformMidnight,
  platformMonthStart,
  toPlatformTime,
} from 'src/common/constants/timezone';
import {
  attendanceEmployee,
  attendanceLeaveType,
  attendanceRequest,
  attendanceShift,
  type StatutoryLeaveKind,
} from 'src/db/schema/attendance';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import type { Transaction } from './attendance-audit';
import {
  overlapMs,
  scheduledWorkIntervals,
  type ScheduledShift,
  type TimeInterval,
} from './attendance-rules';
import { loadEmployeeHours, weeklyMinutesOf } from './employee-hours';
import { requiresMedicalCertificate } from './leave-rules';

export const medicalKinds = [
  'sick',
  'hospitalSick',
  'pregnancyRest',
  'menstrual',
] as const;

export type MedicalKind = (typeof medicalKinds)[number];
export const MAX_MEDICAL_LEAVE_MS = 732 * DAY_MS;
export const isMedicalLeave = (kind: StatutoryLeaveKind): kind is MedicalKind =>
  medicalKinds.some((value) => value === kind);
export interface MedicalRecord {
  id: string;
  kind: MedicalKind;
  startsAt: Date;
  endsAt: Date;
}

interface MedicalShift extends ScheduledShift {
  dayKind: string;
}

export interface MedicalSegment {
  requestId: string;
  kind: MedicalKind;
  start: number;
  end: number;
  units: number;
  calendar: boolean;
  paidFraction: number;
  year: number;
}

const yearOf = (time: number) =>
  toPlatformTime(new Date(time)).getUTCFullYear();
export function medicalLedger(
  records: MedicalRecord[],
  shifts: MedicalShift[],
  weeklyMinutesAt: (at: Date) => number = () => 2400,
) {
  const segments: MedicalSegment[] = [];
  const ordered = [...records].sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
  );
  let episodeEnd = -Infinity;
  let episodeUnits = 0;
  let calendarFrom = Infinity;
  const scheduled = shifts
    .filter((shift) => shift.dayKind === 'workday')
    .flatMap(scheduledWorkIntervals)
    .sort((a, b) => a.start - b.start);
  const merged: TimeInterval[] = [];
  for (const interval of scheduled) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end)
      previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  for (const record of ordered) {
    if (record.kind !== 'menstrual') {
      let undocumentedGap = false;
      if (Number.isFinite(episodeEnd)) {
        for (
          let day = platformMidnight(episodeEnd) + DAY_MS;
          day + DAY_MS <= record.startsAt.getTime();
          day += DAY_MS
        ) {
          if (
            !shifts.some(
              (shift) =>
                shift.dayKind !== 'workday' &&
                platformMidnight(shift.startsAt.getTime()) === day,
            )
          ) {
            undocumentedGap = true;
            break;
          }
        }
      }
      if (
        undocumentedGap ||
        (record.startsAt.getTime() > episodeEnd &&
          merged.some(
            (interval) =>
              interval.start < record.startsAt.getTime() &&
              interval.end > episodeEnd,
          ))
      ) {
        episodeUnits = 0;
        calendarFrom = Infinity;
      }
      episodeEnd = Math.max(episodeEnd, record.endsAt.getTime());
    }
    if (
      record.endsAt.getTime() - record.startsAt.getTime() >
      MAX_MEDICAL_LEAVE_MS
    )
      throw new Error('medicalLeaveInterval');
    for (
      let day = platformMidnight(record.startsAt.getTime());
      day < record.endsAt.getTime();
      day += DAY_MS
    ) {
      const start = Math.max(day, record.startsAt.getTime()),
        end = Math.min(day + DAY_MS, record.endsAt.getTime());
      const dailyWork = merged
        .map((interval) => ({
          start: Math.max(day, interval.start),
          end: Math.min(day + DAY_MS, interval.end),
        }))
        .filter((interval) => interval.end > interval.start);
      const dayMilliseconds = Math.max(
        (weeklyMinutesAt(platformMonthStart(yearOf(day), 0)) / 5) * 60000,
        dailyWork.reduce(
          (sum, interval) => sum + interval.end - interval.start,
          0,
        ),
      );
      const work = dailyWork
        .map((interval) => ({
          start: Math.max(start, interval.start),
          end: Math.min(end, interval.end),
        }))
        .filter((interval) => interval.end > interval.start);
      const hospital = requiresMedicalCertificate(record.kind);
      if (hospital && day >= calendarFrom) {
        segments.push({
          requestId: record.id,
          kind: record.kind,
          start,
          end,
          units: (end - start) / DAY_MS,
          calendar: true,
          paidFraction: 0,
          year: yearOf(start),
        });
      } else {
        for (const interval of work)
          segments.push({
            requestId: record.id,
            kind: record.kind,
            ...interval,
            units: (interval.end - interval.start) / dayMilliseconds,
            calendar: false,
            paidFraction: 0,
            year: yearOf(start),
          });
      }
      if (record.kind !== 'menstrual') {
        episodeUnits += work.reduce(
          (sum, interval) =>
            sum + (interval.end - interval.start) / dayMilliseconds,
          0,
        );
        if (episodeUnits >= 30 - 1e-9 && calendarFrom === Infinity)
          calendarFrom = day + DAY_MS;
      }
    }
  }
  segments.sort(
    (a, b) => a.start - b.start || a.requestId.localeCompare(b.requestId),
  );
  const years = new Map<
    number,
    {
      ordinary: number;
      shared: number;
      paid: number;
      menstrualDays: Set<number>;
    }
  >();
  const paidSegments: MedicalSegment[] = [];
  for (const segment of segments) {
    const year = years.get(segment.year) ?? {
      ordinary: 0,
      shared: 0,
      paid: 0,
      menstrualDays: new Set<number>(),
    };
    years.set(segment.year, year);
    if (segment.kind === 'menstrual')
      year.menstrualDays.add(platformMidnight(segment.start));
    const exempt = segment.kind === 'menstrual' && year.menstrualDays.size <= 3;
    if (exempt) paidSegments.push({ ...segment, paidFraction: 0.5 });
    else {
      const paidUnits = Math.min(segment.units, Math.max(0, 30 - year.paid));
      const paidEnd =
        segment.start +
        Math.round(((segment.end - segment.start) * paidUnits) / segment.units);
      if (paidEnd > segment.start)
        paidSegments.push({
          ...segment,
          end: paidEnd,
          units: paidUnits,
          paidFraction: 0.5,
        });
      if (paidEnd < segment.end)
        paidSegments.push({
          ...segment,
          start: paidEnd,
          units: segment.units - paidUnits,
          paidFraction: 0,
        });
      year.paid += segment.units;
      year.shared += segment.units;
      if (segment.kind === 'sick' || segment.kind === 'menstrual')
        year.ordinary += segment.units;
    }
  }
  return { segments: paidSegments, years };
}

type LedgerEmployee = typeof attendanceEmployee.$inferSelect;

async function medicalLedgers(
  db: DrizzleDB | Transaction,
  employees: LedgerEmployee[],
  proposed?: MedicalRecord,
) {
  const ids = employees.map((employee) => employee.id);
  const organizationId = employees[0]?.organizationId;
  const rows = ids.length
    ? await db
        .select({
          request: attendanceRequest,
          kind: attendanceLeaveType.statutoryKind,
        })
        .from(attendanceRequest)
        .innerJoin(
          attendanceLeaveType,
          eq(attendanceLeaveType.id, attendanceRequest.leaveTypeId),
        )
        .where(
          and(
            eq(attendanceRequest.organizationId, organizationId),
            inArray(attendanceRequest.employeeId, ids),
            inArray(attendanceRequest.status, [
              'approved',
              'cancellationPending',
            ]),
            inArray(attendanceLeaveType.statutoryKind, [...medicalKinds]),
          ),
        )
    : [];
  const recordsOf = new Map(ids.map((id) => [id, [] as MedicalRecord[]]));
  for (const row of rows)
    if (row.request.id !== proposed?.id)
      recordsOf
        .get(row.request.employeeId)
        ?.push({ ...row.request, kind: row.kind as MedicalKind });
  if (proposed) recordsOf.get(ids[0])?.push(proposed);
  const ranges = new Map<string, TimeInterval>();
  for (const [id, records] of recordsOf) {
    records.sort(
      (a, b) =>
        a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
    );
    if (records.length)
      ranges.set(id, {
        start: platformMidnight(records[0].startsAt.getTime()),
        end:
          Math.max(
            ...records.map((record) =>
              platformMidnight(record.endsAt.getTime() - 1),
            ),
          ) + DAY_MS,
      });
  }
  const bounds = [...ranges.values()];
  const shifts = bounds.length
    ? await db
        .select()
        .from(attendanceShift)
        .where(
          and(
            eq(attendanceShift.organizationId, organizationId),
            inArray(attendanceShift.employeeId, [...ranges.keys()]),
            ne(attendanceShift.status, 'cancelled'),
            lt(
              attendanceShift.startsAt,
              new Date(Math.max(...bounds.map((range) => range.end))),
            ),
            gt(
              attendanceShift.endsAt,
              new Date(Math.min(...bounds.map((range) => range.start))),
            ),
          ),
        )
    : [];
  shifts.sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
  );
  const hoursOf = await loadEmployeeHours(db, employees);
  return new Map(
    employees.map((employee) => {
      const records = recordsOf.get(employee.id) ?? [];
      const range = ranges.get(employee.id);
      const own = range
        ? shifts.filter(
            (shift) =>
              shift.employeeId === employee.id &&
              shift.startsAt.getTime() < range.end &&
              shift.endsAt.getTime() > range.start,
          )
        : [];
      return [
        employee.id,
        {
          ...medicalLedger(
            records,
            own,
            weeklyMinutesOf(hoursOf.get(employee.id)!),
          ),
          records,
          shifts: own,
        },
      ];
    }),
  );
}

export async function loadMedicalLedger(
  db: DrizzleDB | Transaction,
  employee: LedgerEmployee,
  proposed?: MedicalRecord,
) {
  const ledgers = await medicalLedgers(db, [employee], proposed);
  return ledgers.get(employee.id)!;
}

export const loadMedicalLedgers = (
  db: DrizzleDB | Transaction,
  employees: LedgerEmployee[],
) => medicalLedgers(db, employees);
export function medicalPaidSeconds(
  segments: MedicalSegment[],
  requestId: string,
  start: number,
  end: number,
) {
  return segments
    .filter((segment) => segment.requestId === requestId)
    .reduce(
      (sum, segment) =>
        sum + (overlapMs(segment, start, end) / 1000) * segment.paidFraction,
      0,
    );
}
