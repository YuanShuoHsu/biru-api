import { averageWeeklyMinutes, weeklyMinutesAt } from './employee-hours';

const at = (value: string) => new Date(`${value}+08:00`);
const shift = (day: string, from: string, to: string) => ({
  startsAt: at(`${day}T${from}:00`),
  endsAt: at(`${day}T${to}:00`),
  paidBreak: false,
  breaks: [],
});

describe('averageWeeklyMinutes', () => {
  it('averages scheduled normal minutes over the year before the date', () => {
    const normalShifts = Array.from({ length: 52 }, (_, week) => {
      const day = new Date(Date.UTC(2025, 0, 1 + week * 7))
        .toISOString()
        .slice(0, 10);
      return shift(day, '09:00', '19:00');
    });
    expect(
      averageWeeklyMinutes(
        { hiredAt: at('2024-01-01T00:00:00'), normalShifts },
        at('2025-12-31T09:00:00'),
      ),
    ).toBe(480);
  });
  it('starts the window at the first scheduled shift', () => {
    expect(
      averageWeeklyMinutes(
        {
          hiredAt: at('2020-01-01T00:00:00'),
          normalShifts: [shift('2025-12-24', '09:00', '13:00')],
        },
        at('2025-12-31T09:00:00'),
      ),
    ).toBe(240);
  });
  it('does not count a shift still running at the date', () => {
    expect(
      averageWeeklyMinutes(
        {
          hiredAt: at('2025-01-01T00:00:00'),
          normalShifts: [shift('2025-12-31', '09:00', '13:00')],
        },
        at('2025-12-31T10:00:00'),
      ),
    ).toBeNull();
  });
});

describe('weeklyMinutesAt', () => {
  it('treats an employee without any schedule as full time', () => {
    expect(
      weeklyMinutesAt(
        { hiredAt: at('2025-01-01T00:00:00'), normalShifts: [] },
        at('2026-01-01T00:00:00'),
      ),
    ).toBe(2400);
  });
});
