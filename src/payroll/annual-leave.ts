import { annualLeaveLedger } from 'src/attendance/leave-rules';

export interface AnnualLeaveSettlement {
  startsAt: string;
  endsAt: string;
  unusedMinutes: number;
  wageDate: string;
}

export function annualLeaveSettlement(input: {
  hiredAt: Date;
  terminatedAt: Date | null;
  weeklyMinutesAt: (at: Date) => number;
  start: Date;
  end: Date;
  leaves: { startsAt: Date; leaveMinutes: number | null }[];
  deferredPeriodStarts: Date[];
}) {
  const {
    hiredAt,
    terminatedAt,
    weeklyMinutesAt,
    start,
    end,
    leaves,
    deferredPeriodStarts,
  } = input;
  const terminated =
    terminatedAt && terminatedAt >= start && terminatedAt < end
      ? terminatedAt
      : null;
  const settlements: AnnualLeaveSettlement[] = [];
  // 施行細則 24-1：遞延時數按原特休年度終結時的工資計發，所以每筆各自記下計薪日
  const add = (
    startsAt: Date,
    endsAt: Date,
    unusedMinutes: number,
    wageDate: Date,
  ) => {
    if (unusedMinutes > 0)
      settlements.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        unusedMinutes,
        wageDate: new Date(wageDate.getTime() - 1).toISOString(),
      });
  };

  for (const entry of annualLeaveLedger(
    hiredAt,
    new Date(end.getTime() - 1),
    weeklyMinutesAt,
    leaves,
    deferredPeriodStarts,
  )) {
    if (
      entry.end >= start &&
      entry.end < end &&
      (!terminated || entry.end <= terminated)
    ) {
      add(entry.start, entry.end, entry.expiredMinutes, entry.start);
      if (!entry.deferred || entry.end.getTime() === terminated?.getTime())
        add(entry.start, entry.end, entry.unusedMinutes, entry.end);
    }
  }

  if (terminated) {
    const final = annualLeaveLedger(
      hiredAt,
      terminated,
      weeklyMinutesAt,
      leaves.filter((leave) => leave.startsAt < terminated),
      deferredPeriodStarts,
    ).at(-1);
    if (final && final.start < terminated && final.end > terminated) {
      add(final.start, terminated, final.expiredMinutes, final.start);
      add(final.start, terminated, final.unusedMinutes, terminated);
    }
  }

  return settlements;
}
