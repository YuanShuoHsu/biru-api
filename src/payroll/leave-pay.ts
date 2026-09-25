import { and, desc, eq, lt, lte, ne } from 'drizzle-orm';

import type { Transaction } from 'src/attendance/attendance-audit';
import { scheduledWorkSeconds } from 'src/attendance/attendance-rules';
import { platformDateString } from 'src/common/constants/timezone';
import { attendanceShift } from 'src/db/schema/attendance';
import { payrollTerms } from 'src/db/schema/payroll';

import { insurableWages, precedingMonths } from './insurable-wages';

const NORMAL_DAILY_SECONDS = 8 * 3600;

const AVERAGE_WAGE_MONTHS = 6;

const monthDays = (month: string) => {
  const [year, number] = month.split('-').map(Number);

  return new Date(Date.UTC(year, number, 0)).getUTCDate();
};

export const statutoryDailyPayCents = async (
  tx: Transaction,
  employeeId: string,
  startsAt: Date,
) => {
  const [current] = await tx
    .select({ terms: payrollTerms.terms })
    .from(payrollTerms)
    .where(
      and(
        eq(payrollTerms.employeeId, employeeId),
        lte(payrollTerms.effectiveFrom, startsAt),
      ),
    )
    .orderBy(desc(payrollTerms.effectiveFrom), desc(payrollTerms.version))
    .limit(1);
  if (!current) return null;
  const { allowanceCents, salaryCents, salaryType } = current.terms;
  let agreed: bigint;
  if (salaryType === 'monthly')
    agreed = (BigInt(salaryCents) + BigInt(allowanceCents) + 15n) / 30n;
  else {
    const [lastWorkday] = await tx
      .select()
      .from(attendanceShift)
      .where(
        and(
          eq(attendanceShift.employeeId, employeeId),
          ne(attendanceShift.status, 'cancelled'),
          eq(attendanceShift.dayKind, 'workday'),
          lt(attendanceShift.startsAt, startsAt),
        ),
      )
      .orderBy(desc(attendanceShift.startsAt))
      .limit(1);
    const seconds = lastWorkday
      ? Math.min(scheduledWorkSeconds(lastWorkday), NORMAL_DAILY_SECONDS)
      : 0;
    agreed = (BigInt(salaryCents) * BigInt(seconds) + 1800n) / 3600n;
  }
  const wages = await insurableWages(
    tx,
    employeeId,
    precedingMonths(
      platformDateString(startsAt).slice(0, 7),
      AVERAGE_WAGE_MONTHS,
    ),
  );
  const days = wages.reduce((sum, { month }) => sum + monthDays(month), 0);
  const average = days
    ? wages.reduce((sum, { cents }) => sum + cents, 0n) / BigInt(days)
    : 0n;

  return (agreed > average ? agreed : average).toString();
};
