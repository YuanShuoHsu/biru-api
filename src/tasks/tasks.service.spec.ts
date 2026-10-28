import { monthsAgo } from './tasks.service.js';

describe('monthsAgo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [
      'clamps 8/31 minus 6 months to the end of February',
      [2026, 7, 31],
      6,
      [2026, 1, 28],
    ],
    [
      'clamps 3/31 minus 1 month to the end of February',
      [2026, 2, 31],
      1,
      [2026, 1, 28],
    ],
    [
      'clamps a leap day minus 12 months to 2/28',
      [2028, 1, 29],
      12,
      [2027, 1, 28],
    ],
    [
      'clamps a leap day minus 60 months to 2/28 of a common year',
      [2028, 1, 29],
      60,
      [2023, 1, 28],
    ],
    ['keeps the day of month when it exists', [2026, 9, 28], 6, [2026, 3, 28]],
    ['crosses the year boundary', [2026, 0, 15], 1, [2025, 11, 15]],
  ])(
    '%s',
    (_, [year, month, day], months, [cutoffYear, cutoffMonth, cutoffDay]) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(year, month, day, 3, 0, 0));

      expect(monthsAgo(months)).toEqual(
        new Date(cutoffYear, cutoffMonth, cutoffDay, 3, 0, 0),
      );
    },
  );
});
