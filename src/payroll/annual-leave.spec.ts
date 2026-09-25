import { annualLeaveSettlement } from './annual-leave';

const input = {
  hiredAt: new Date('2020-07-01T00:00:00+08:00'),
  terminatedAt: null,
  weeklyMinutesAt: () => 2400,
  start: new Date('2026-07-01T00:00:00+08:00'),
  end: new Date('2026-08-01T00:00:00+08:00'),
  leaves: [{ startsAt: new Date('2026-01-10'), leaveMinutes: 480 }],
  deferredPeriodStarts: [] as Date[],
};
const deferred2024 = [new Date('2024-07-01T00:00:00+08:00')];
describe('Unused annual leave settlement', () => {
  it('pays the unused entitlement at year end when no deferral was agreed', () => {
    const settlements = annualLeaveSettlement(input);
    expect(settlements).toHaveLength(1);
    expect(settlements[0].unusedMinutes).toBe(15 * 480 - 480);
    expect(settlements[0].wageDate).toBe('2026-06-30T15:59:59.999Z');
  });
  it('pays deferred hours that expired unused at the original year-end wage', () => {
    const settlements = annualLeaveSettlement({
      ...input,
      deferredPeriodStarts: deferred2024,
    });
    expect(settlements.map((item) => item.unusedMinutes)).toEqual([
      14 * 480 - 480,
      15 * 480,
    ]);
    expect(settlements[0].wageDate).toBe('2025-06-30T15:59:59.999Z');
  });
  it('carries the current entitlement only when a deferral was agreed', () => {
    expect(
      annualLeaveSettlement({
        ...input,
        leaves: [],
        deferredPeriodStarts: [new Date('2025-07-01T00:00:00+08:00')],
      }),
    ).toEqual([]);
  });
  it('does not pay the same entitlement in the following month', () => {
    expect(
      annualLeaveSettlement({
        ...input,
        start: input.end,
        end: new Date('2026-09-01T00:00:00+08:00'),
      }),
    ).toEqual([]);
  });
  it('settles the carried-over and current entitlement when employment ends mid-year', () => {
    const termination = {
      ...input,
      terminatedAt: new Date('2026-03-15T18:00:00+08:00'),
      start: new Date('2026-03-01T00:00:00+08:00'),
      end: new Date('2026-04-01T00:00:00+08:00'),
    };
    expect(
      annualLeaveSettlement(termination).map((item) => item.unusedMinutes),
    ).toEqual([15 * 480 - 480]);
    expect(
      annualLeaveSettlement({
        ...termination,
        deferredPeriodStarts: deferred2024,
      }).map((item) => item.unusedMinutes),
    ).toEqual([14 * 480 - 480, 15 * 480]);
  });
  it('pays a deferred entitlement when employment ends on its year end', () => {
    expect(
      annualLeaveSettlement({
        ...input,
        leaves: [],
        terminatedAt: new Date('2026-07-01T00:00:00+08:00'),
        deferredPeriodStarts: [new Date('2025-07-01T00:00:00+08:00')],
      }).map((item) => item.unusedMinutes),
    ).toEqual([15 * 480]);
  });
  it('keeps the entitlement granted at the period start when hours change later', () => {
    const raised = new Date('2026-01-01T00:00:00+08:00');
    const settlements = annualLeaveSettlement({
      ...input,
      leaves: [],
      weeklyMinutesAt: (at: Date) => (at < raised ? 1200 : 2400),
    });
    expect(settlements[0].unusedMinutes).toBe(15 * 480 * 0.5);
  });
});
