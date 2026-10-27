import type { OpeningCalendar } from '../common/utils/opening-hours.js';

export const pickupHoursError = (
  calendar: OpeningCalendar,
  cutoffMinutes: number,
  at: Date,
): 'pickupOutsideOpeningHours' | 'pickupTooCloseToClosing' | null => {
  if (!calendar.isOpenAt(at)) return 'pickupOutsideOpeningHours';

  if (calendar.minutesUntilClose(at) < Math.max(cutoffMinutes, 0))
    return 'pickupTooCloseToClosing';

  return null;
};
