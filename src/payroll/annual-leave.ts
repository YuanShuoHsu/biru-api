import { annualLeavePeriod } from 'src/attendance/leave-rules';
import type { PayrollTerms } from 'src/db/schema/payroll';

import { hourlyRate, roundRatio } from './payroll-calculation';

export function annualLeaveSettlement(input: {
  hiredAt: Date;
  terminatedAt: Date | null;
  weeklyMinutesAt: (at: Date) => number;
  start: Date;
  end: Date;
  terms: PayrollTerms;
  leaves: { startsAt: Date; leaveMinutes: number | null }[];
}) {
  const { hiredAt, terminatedAt, weeklyMinutesAt, start, end, terms, leaves } =
    input;
  const periods = new Map<
    string,
    NonNullable<ReturnType<typeof annualLeavePeriod>>
  >();
  for (const at of [
    new Date(start.getTime() - 1),
    new Date(end.getTime() - 1),
    ...(terminatedAt && terminatedAt >= start && terminatedAt < end
      ? [new Date(terminatedAt.getTime() - 1)]
      : []),
  ]) {
    const period = annualLeavePeriod(hiredAt, at, weeklyMinutesAt);
    if (period) periods.set(period.start.toISOString(), period);
  }
  let unusedMinutes = 0;
  const settlements: {
    startsAt: string;
    endsAt: string;
    unusedMinutes: number;
  }[] = [];
  for (const period of periods.values()) {
    const due = new Date(
      Math.min(period.end.getTime(), terminatedAt?.getTime() ?? Infinity),
    );
    if (due < start || due >= end || due <= period.start) continue;
    const used = leaves
      .filter((leave) => leave.startsAt >= period.start && leave.startsAt < due)
      .reduce((sum, leave) => sum + (leave.leaveMinutes ?? 0), 0);
    const minutes = Math.max(0, period.minutes - used);
    unusedMinutes += minutes;
    settlements.push({
      startsAt: period.start.toISOString(),
      endsAt: due.toISOString(),
      unusedMinutes: minutes,
    });
  }
  const { numerator, denominator } = hourlyRate(terms);
  return {
    amountCents: roundRatio(
      numerator * BigInt(unusedMinutes),
      denominator * 60n,
    ).toString(),
    settlements,
  };
}
