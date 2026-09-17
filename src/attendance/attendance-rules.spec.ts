import {
  distanceMeters,
  leadingIntervals,
  normalizeIp,
  overlapIntervals,
  scheduledWorkIntervals,
  summarizeEvents,
} from './attendance-rules';

describe('attendance rules', () => {
  it('handles overnight work and multiple paid/unpaid breaks', () => {
    const events = [
      { action: 'clockIn' as const, occurredAt: '2026-09-01T14:00:00Z' },
      { action: 'breakStart' as const, occurredAt: '2026-09-01T16:00:00Z' },
      { action: 'breakEnd' as const, occurredAt: '2026-09-01T16:30:00Z' },
      { action: 'breakStart' as const, occurredAt: '2026-09-01T18:00:00Z' },
      { action: 'breakEnd' as const, occurredAt: '2026-09-01T18:15:00Z' },
      { action: 'clockOut' as const, occurredAt: '2026-09-01T22:00:00Z' },
    ];
    expect(summarizeEvents(events, false)).toEqual({
      state: 'completed',
      workedSeconds: 26100,
      breakSeconds: 2700,
      unpaidBreakSeconds: 2700,
      availableActions: [],
    });
    expect(summarizeEvents(events, true).workedSeconds).toBe(28800);
  });
  it('preserves paid and unpaid breaks in one corrected shift', () => {
    const result = summarizeEvents(
      [
        { action: 'clockIn', occurredAt: '2026-09-01T00:00:00Z' },
        {
          action: 'breakStart',
          occurredAt: '2026-09-01T01:00:00Z',
          paidBreak: true,
        },
        { action: 'breakEnd', occurredAt: '2026-09-01T01:15:00Z' },
        {
          action: 'breakStart',
          occurredAt: '2026-09-01T02:00:00Z',
          paidBreak: false,
        },
        { action: 'breakEnd', occurredAt: '2026-09-01T02:30:00Z' },
        { action: 'clockOut', occurredAt: '2026-09-01T04:00:00Z' },
      ],
      false,
    );
    expect(result).toEqual({
      state: 'completed',
      workedSeconds: 12600,
      breakSeconds: 2700,
      unpaidBreakSeconds: 1800,
      availableActions: [],
    });
  });
  it('rejects checkout during a break, duplicate check-in and unordered times', () => {
    const clockIn = {
      action: 'clockIn' as const,
      occurredAt: '2026-09-01T00:00:00Z',
    };
    expect(() => summarizeEvents([clockIn, clockIn], false)).toThrow();
    expect(() =>
      summarizeEvents(
        [
          clockIn,
          { action: 'breakStart', occurredAt: '2026-09-01T01:00:00Z' },
          { action: 'clockOut', occurredAt: '2026-09-01T02:00:00Z' },
        ],
        false,
      ),
    ).toThrow();
  });
  it('does not fabricate a missing checkout', () => {
    expect(
      summarizeEvents(
        [{ action: 'clockIn', occurredAt: '2026-09-01T00:00:00Z' }],
        false,
      ),
    ).toEqual({
      state: 'working',
      workedSeconds: 0,
      breakSeconds: 0,
      unpaidBreakSeconds: 0,
      availableActions: ['breakStart', 'clockOut'],
    });
  });
  it('normalizes mapped IPv4 and IPv6 addresses', () => {
    expect(normalizeIp('::ffff:203.0.113.1')).toBe('203.0.113.1');
    expect(normalizeIp('2001:0db8:0:0:0:0:0:1')).toBe('2001:db8::1');
    expect(() => normalizeIp('not-an-ip')).toThrow();
  });
  it('measures geofence distance', () => {
    expect(
      distanceMeters(
        { latitude: 25, longitude: 121 },
        { latitude: 25, longitude: 121 },
      ),
    ).toBe(0);
    expect(
      distanceMeters(
        { latitude: 25, longitude: 121 },
        { latitude: 25.001, longitude: 121 },
      ),
    ).toBeCloseTo(111.19, 1);
  });
  it('splits a shift around its unpaid break only', () => {
    const shift = {
      startsAt: new Date('2026-09-01T01:00:00Z'),
      endsAt: new Date('2026-09-01T10:00:00Z'),
      breakStartsAt: new Date('2026-09-01T04:00:00Z'),
      breakEndsAt: new Date('2026-09-01T05:00:00Z'),
    };
    const hour = 3600000;
    const start = shift.startsAt.getTime();
    expect(scheduledWorkIntervals(shift)).toEqual([
      { start, end: start + 3 * hour },
      { start: start + 4 * hour, end: start + 9 * hour },
    ]);
    expect(scheduledWorkIntervals({ ...shift, paidBreak: true })).toEqual([
      { start, end: start + 9 * hour },
    ]);
    expect(
      scheduledWorkIntervals({
        ...shift,
        breakStartsAt: shift.startsAt,
        breakEndsAt: shift.breakEndsAt,
      }),
    ).toEqual([{ start: start + 4 * hour, end: start + 9 * hour }]);
  });
  it('clips intervals to a window and to a leading time budget', () => {
    const intervals = [
      { start: 0, end: 3 },
      { start: 4, end: 9 },
    ];
    expect(overlapIntervals(intervals, 2, 5)).toEqual([
      { start: 2, end: 3 },
      { start: 4, end: 5 },
    ]);
    expect(leadingIntervals(intervals, 5)).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 6 },
    ]);
    expect(leadingIntervals(intervals, -1)).toEqual([]);
  });
});
