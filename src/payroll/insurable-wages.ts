import { and, eq, inArray } from 'drizzle-orm';

import type { Transaction } from 'src/attendance/attendance-audit';
import { payrollStatement } from 'src/db/schema/payroll';

export const precedingMonths = (month: string, count: number) => {
  const [year, number] = month.split('-').map(Number);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, number - 2 - index, 1));

    return date.toISOString().slice(0, 7);
  });
};

export const insurableWages = async (
  tx: Transaction,
  employeeId: string,
  months: string[],
) =>
  (
    await tx
      .select({
        month: payrollStatement.month,
        snapshot: payrollStatement.snapshot,
      })
      .from(payrollStatement)
      .where(
        and(
          eq(payrollStatement.employeeId, employeeId),
          eq(payrollStatement.status, 'published'),
          inArray(payrollStatement.month, months),
        ),
      )
  ).map(({ month, snapshot }) => ({
    month,
    cents: [
      'annualLeavePay',
      'injuryCompensation',
      'severancePay',
      'noticePay',
    ].reduce(
      (cents, excluded) =>
        cents -
        BigInt(
          snapshot.lines.find(({ code }) => code === excluded)?.amountCents ??
            '0',
        ),
      BigInt(snapshot.grossCents),
    ),
  }));

export const averageMonthlyWage = (wages: { cents: bigint }[]) =>
  Number(wages.reduce((sum, { cents }) => sum + cents, 0n)) /
  100 /
  wages.length;
