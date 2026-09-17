import { weeklyMinutesAt } from './employee-hours';

const employee = {
  weeklyMinutes: 2400,
  weeklyMinutesHistory: [
    { from: '2025-01-01T00:00:00+08:00', minutes: 1200 },
    { from: '2026-07-01T00:00:00+08:00', minutes: 2400 },
  ],
};

describe('weeklyMinutesAt', () => {
  it('reads the hours in force on the given date', () => {
    expect(
      weeklyMinutesAt(employee, new Date('2026-06-30T23:59:59+08:00')),
    ).toBe(1200);
    expect(
      weeklyMinutesAt(employee, new Date('2026-07-01T00:00:00+08:00')),
    ).toBe(2400);
  });
  it('reads the earliest recorded hours for a date before the first change', () => {
    expect(
      weeklyMinutesAt(employee, new Date('2024-01-01T00:00:00+08:00')),
    ).toBe(1200);
  });
  it('falls back to the stored hours when nothing was recorded', () => {
    expect(
      weeklyMinutesAt(
        { weeklyMinutes: 900, weeklyMinutesHistory: [] },
        new Date(),
      ),
    ).toBe(900);
  });
});
