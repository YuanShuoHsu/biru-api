import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';

import { DAY_MS, PLATFORM_TIMEZONE } from 'src/common/constants/timezone';
import {
  attendanceEmployee,
  attendanceShift,
  type AttendanceEmploymentType,
} from 'src/db/schema/attendance';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import type { Transaction } from './attendance-audit';
import { scheduledWorkSeconds, type ScheduledShift } from './attendance-rules';
import { anniversary } from './leave-rules';

export const FULL_TIME_WEEKLY_MINUTES = 2400;
export const NORMAL_DAILY_MINUTES = 480;

const WEEK_MS = 7 * DAY_MS;

export interface EmployeeHours {
  hiredAt: Date;
  normalShifts: ScheduledShift[];
}

export async function loadEmployeeHours(
  db: DrizzleDB | Transaction,
  employees: { id: string; hiredAt: Date }[],
) {
  const shifts = employees.length
    ? await db
        .select({
          employeeId: attendanceShift.employeeId,
          startsAt: attendanceShift.startsAt,
          endsAt: attendanceShift.endsAt,
          paidBreak: attendanceShift.paidBreak,
          breaks: attendanceShift.breaks,
        })
        .from(attendanceShift)
        .where(
          and(
            inArray(
              attendanceShift.employeeId,
              employees.map((employee) => employee.id),
            ),
            ne(attendanceShift.status, 'cancelled'),
            eq(attendanceShift.dayKind, 'workday'),
          ),
        )
        .orderBy(asc(attendanceShift.startsAt))
    : [];

  return new Map(
    employees.map((employee): [string, EmployeeHours] => [
      employee.id,
      {
        hiredAt: employee.hiredAt,
        normalShifts: shifts.filter(
          (shift) => shift.employeeId === employee.id,
        ),
      },
    ]),
  );
}

export const loadOneEmployeeHours = async (
  db: DrizzleDB | Transaction,
  employee: { id: string; hiredAt: Date },
) => (await loadEmployeeHours(db, [employee])).get(employee.id)!;

export const averageWeeklyMinutes = (
  { hiredAt, normalShifts }: EmployeeHours,
  at: Date,
): number | null => {
  const [first] = normalShifts;
  if (!first) return null;
  const from = Math.max(
    hiredAt.getTime(),
    anniversary(at, -12).getTime(),
    first.startsAt.getTime(),
  );
  const counted = normalShifts.filter(
    (shift) =>
      shift.startsAt.getTime() >= from &&
      shift.endsAt.getTime() <= at.getTime(),
  );
  if (!counted.length) return null;
  const minutes = counted.reduce(
    (sum, shift) =>
      sum + Math.min(NORMAL_DAILY_MINUTES, scheduledWorkSeconds(shift) / 60),
    0,
  );

  return Math.round((minutes * WEEK_MS) / (at.getTime() - from));
};

export const weeklyMinutesAt = (hours: EmployeeHours, at: Date): number =>
  averageWeeklyMinutes(hours, at) ?? FULL_TIME_WEEKLY_MINUTES;

export const weeklyMinutesOf =
  (hours: EmployeeHours) =>
  (at: Date): number =>
    weeklyMinutesAt(hours, at);

export const employmentType = (
  weeklyMinutes: number,
): AttendanceEmploymentType =>
  weeklyMinutes < FULL_TIME_WEEKLY_MINUTES ? 'partTime' : 'fullTime';

const normalShiftSql = (alias: string) =>
  sql.raw(`${alias}.status <> 'cancelled' AND ${alias}.day_kind = 'workday'`);

export const averageWeeklyMinutesSql = sql<number | null>`(
  SELECT CASE WHEN t.shifts = 0 THEN NULL
    ELSE round(t.minutes * 10080 / (extract(epoch FROM now() - w.from_at) / 60))
  END
  FROM (SELECT greatest(
    ${attendanceEmployee.hiredAt},
    (date_trunc('day', now() AT TIME ZONE ${PLATFORM_TIMEZONE}) - interval '1 year') AT TIME ZONE ${PLATFORM_TIMEZONE},
    (SELECT min(f.starts_at) FROM attendance_shift f
      WHERE f.employee_id = ${attendanceEmployee.id} AND ${normalShiftSql('f')})
  ) AS from_at) w
  CROSS JOIN LATERAL (
    SELECT count(*) AS shifts, sum(least(
      ${sql.raw(String(NORMAL_DAILY_MINUTES))},
      extract(epoch FROM s.ends_at - s.starts_at - CASE
        WHEN s.paid_break THEN interval '0'
        ELSE (SELECT coalesce(sum((b->>'endsAt')::timestamptz - (b->>'startsAt')::timestamptz), interval '0')
          FROM jsonb_array_elements(s.breaks) b)
      END) / 60
    )) AS minutes
    FROM attendance_shift s
    WHERE s.employee_id = ${attendanceEmployee.id}
      AND ${normalShiftSql('s')}
      AND s.starts_at >= w.from_at
      AND s.ends_at <= now()
  ) t
)`;

export const employmentTypeSql = sql<AttendanceEmploymentType | null>`CASE
  WHEN ${attendanceEmployee.id} IS NULL THEN NULL
  WHEN coalesce(${averageWeeklyMinutesSql}, ${sql.raw(String(FULL_TIME_WEEKLY_MINUTES))}) < ${sql.raw(String(FULL_TIME_WEEKLY_MINUTES))} THEN 'partTime'
  ELSE 'fullTime'
END`;
