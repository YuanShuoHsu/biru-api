import {
  anniversary,
  annualLeavePeriod,
  calendarLeaveMinutes,
  eventLeaveEntitlement,
  statutoryLeavePeriod,
} from './leave-rules';

describe('Taiwan statutory leave periods', () => {
  const hired = new Date('2020-07-01T00:00:00+08:00');
  it('grants separate six-month and first-year entitlements', () => {
    expect(
      annualLeavePeriod(hired, new Date('2020-12-31T00:00:00+08:00')),
    ).toBeNull();
    expect(
      annualLeavePeriod(hired, new Date('2021-01-01T00:00:00+08:00'))?.minutes,
    ).toBe(3 * 480);
    expect(
      annualLeavePeriod(hired, new Date('2021-07-01T00:00:00+08:00'))?.minutes,
    ).toBe(7 * 480);
  });
  it.each([
    [2, 10],
    [3, 14],
    [5, 15],
    [10, 16],
    [24, 30],
    [30, 30],
  ])('grants the statutory entitlement at year %i', (years, days) => {
    expect(
      annualLeavePeriod(hired, anniversary(hired, years * 12))?.minutes,
    ).toBe(days * 480);
  });
  it('clamps leap-day anniversaries and prorates part-time hours', () => {
    const leap = new Date('2024-02-29T00:00:00+08:00');
    expect(anniversary(leap, 12).toISOString()).toBe(
      '2025-02-27T16:00:00.000Z',
    );
    expect(
      annualLeavePeriod(
        hired,
        new Date('2021-07-01T00:00:00+08:00'),
        () => 1200,
      )?.minutes,
    ).toBe(7 * 240);
  });
  it('keeps monthly menstrual limits separate from annual family-care limits', () => {
    const at = new Date('2026-02-05');
    expect(
      statutoryLeavePeriod('menstrual', hired, at)?.end.toISOString(),
    ).toBe('2026-02-28T16:00:00.000Z');
    expect(statutoryLeavePeriod('familyCare', hired, at)?.minutes).toBe(
      7 * 480,
    );
  });
});

describe('Event leave entitlements', () => {
  it.each([
    ['marriage', 8],
    ['funeral8', 8],
    ['funeral6', 6],
    ['funeral3', 3],
    ['prenatal', 7],
    ['paternity', 7],
  ] as const)(
    'grants %s once per event using agreed part-time hours',
    (kind, days) => {
      expect(
        eventLeaveEntitlement(
          kind,
          new Date('2020-01-01'),
          new Date('2026-01-01'),
          1200,
        ),
      ).toEqual({ grantedMinutes: days * 240, paidPercent: 100 });
    },
  );
  it('uses full calendar days for maternity and applies the six-month boundary', () => {
    const hired = new Date('2025-09-01T00:00:00+08:00');
    expect(
      eventLeaveEntitlement(
        'maternity',
        hired,
        new Date('2026-02-28T00:00:00+08:00'),
        1200,
      ),
    ).toEqual({ grantedMinutes: 56 * 1440, paidPercent: 50 });
    expect(
      eventLeaveEntitlement(
        'maternity',
        hired,
        new Date('2026-03-01T00:00:00+08:00'),
        1200,
      ).paidPercent,
    ).toBe(100);
    expect(
      eventLeaveEntitlement('miscarriage7', hired, new Date('2026-03-01'), 2400)
        .paidPercent,
    ).toBe(0);
  });
  it('rejects partial calendar days and accepts cross-year periods', () => {
    expect(
      calendarLeaveMinutes(
        new Date('2025-12-31T00:00:00+08:00'),
        new Date('2026-01-02T00:00:00+08:00'),
      ),
    ).toBe(2880);
    expect(
      calendarLeaveMinutes(
        new Date('2025-12-31T09:00:00+08:00'),
        new Date('2026-01-02T09:00:00+08:00'),
      ),
    ).toBe(0);
  });
});
