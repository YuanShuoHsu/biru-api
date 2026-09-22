import { annualLeaveLedger } from 'src/attendance/leave-rules';
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
  const terminated =
    terminatedAt && terminatedAt >= start && terminatedAt < end
      ? terminatedAt
      : null;
  const settlements: {
    startsAt: string;
    endsAt: string;
    unusedMinutes: number;
  }[] = [];
  const add = (startsAt: Date, endsAt: Date, unusedMinutes: number) => {
    if (unusedMinutes > 0)
      settlements.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        unusedMinutes,
      });
  };

  for (const entry of annualLeaveLedger(
    hiredAt,
    new Date(end.getTime() - 1),
    weeklyMinutesAt,
    leaves,
  )) {
    if (
      entry.end >= start &&
      entry.end < end &&
      (!terminated || entry.end <= terminated)
    )
      add(entry.start, entry.end, entry.expiredMinutes);
  }

  if (terminated) {
    const final = annualLeaveLedger(
      hiredAt,
      terminated,
      weeklyMinutesAt,
      leaves.filter((leave) => leave.startsAt < terminated),
    ).at(-1);
    if (final)
      add(
        final.start,
        terminated,
        final.expiredMinutes + final.carryOutMinutes,
      );
  }

  const unusedMinutes = settlements.reduce(
    (sum, settlement) => sum + settlement.unusedMinutes,
    0,
  );
  const { numerator, denominator } = hourlyRate(terms);

  return {
    amountCents: roundRatio(
      numerator * BigInt(unusedMinutes),
      denominator * 60n,
    ).toString(),
    settlements,
  };
}
