import { openingCalendar } from '../common/utils/opening-hours.js';
import { pickupHoursError } from './pickup-hours.js';

const at = (local: string) => new Date(`${local}+08:00`);

describe('pickup hours', () => {
  const calendar = openingCalendar('Mo-Fr 09:00-18:00', [
    { openingHours: null, validFrom: '2026-09-01', validThrough: '2026-09-01' },
  ]);

  it('accepts a time well before closing', () => {
    expect(pickupHoursError(calendar, 30, at('2026-08-31T12:00'))).toBeNull();
  });

  it('rejects a time outside the opening hours', () => {
    expect(pickupHoursError(calendar, 30, at('2026-08-31T19:00'))).toBe(
      'pickupOutsideOpeningHours',
    );
    expect(pickupHoursError(calendar, 30, at('2026-09-01T12:00'))).toBe(
      'pickupOutsideOpeningHours',
    );
  });

  it('rejects a time inside the cutoff before closing', () => {
    expect(pickupHoursError(calendar, 30, at('2026-08-31T17:45'))).toBe(
      'pickupTooCloseToClosing',
    );
    expect(pickupHoursError(calendar, -5, at('2026-08-31T17:45'))).toBeNull();
  });
});
