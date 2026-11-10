import type { OpeningCalendar } from '../common/utils/opening-hours.js';

export const pickupHoursError = (
  calendar: OpeningCalendar,
  cutoffMinutes: number,
  at: Date,
): 'pickupOutsideOpeningHours' | 'pickupTooCloseToClosing' | null => {
  if (!calendar.isOpenAt(at)) return 'pickupOutsideOpeningHours';

  const cutoff = Math.max(cutoffMinutes, 0);
  if (calendar.minutesUntilClose(at, cutoff) < cutoff)
    return 'pickupTooCloseToClosing';

  return null;
};
