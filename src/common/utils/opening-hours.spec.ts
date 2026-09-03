import {
  getMinutesUntilClose,
  isValidOpeningHours,
  isWithinOpeningHours,
} from './opening-hours';

const at = (local: string) => new Date(`${local}+08:00`);

describe('opening hours', () => {
  const hours = 'Mo-Fr 09:00-18:00\nSa 10:00-14:00';

  it('weekday inside', () => {
    expect(isWithinOpeningHours(hours, at('2026-08-31T09:00'))).toBe(true);
    expect(isWithinOpeningHours(hours, at('2026-08-31T17:59'))).toBe(true);
  });

  it('weekday outside', () => {
    expect(isWithinOpeningHours(hours, at('2026-08-31T08:59'))).toBe(false);
    expect(isWithinOpeningHours(hours, at('2026-08-31T18:00'))).toBe(false);
  });

  it('saturday and sunday', () => {
    expect(isWithinOpeningHours(hours, at('2026-09-05T10:00'))).toBe(true);
    expect(isWithinOpeningHours(hours, at('2026-09-05T14:00'))).toBe(false);
    expect(isWithinOpeningHours(hours, at('2026-09-06T12:00'))).toBe(false);
  });

  it('empty means always open', () => {
    expect(isWithinOpeningHours(null, at('2026-09-06T03:00'))).toBe(true);
    expect(isWithinOpeningHours('', at('2026-09-06T03:00'))).toBe(true);
  });

  it('minutes until close', () => {
    expect(getMinutesUntilClose(hours, at('2026-08-31T09:00'))).toBe(9 * 60);
  });

  it('a closed store has no minutes left', () => {
    expect(getMinutesUntilClose(hours, at('2026-09-06T12:00'))).toBe(0);
    expect(getMinutesUntilClose(hours, at('2026-08-31T18:00'))).toBe(0);
  });

  it('empty means never closing', () => {
    expect(getMinutesUntilClose(null, at('2026-09-06T03:00'))).toBe(Infinity);
    expect(getMinutesUntilClose('', at('2026-09-06T03:00'))).toBe(Infinity);
  });

  it('comma day list', () => {
    expect(
      isWithinOpeningHours('Mo,We 09:00-18:00', at('2026-08-31T10:00')),
    ).toBe(true);
    expect(
      isWithinOpeningHours('Mo,We 09:00-18:00', at('2026-09-01T10:00')),
    ).toBe(false);
  });

  it('mixed day list', () => {
    const mixed = 'Mo-Fr,Su 09:00-18:00';
    expect(isWithinOpeningHours(mixed, at('2026-08-31T10:00'))).toBe(true);
    expect(isWithinOpeningHours(mixed, at('2026-09-06T10:00'))).toBe(true);
    expect(isWithinOpeningHours(mixed, at('2026-09-05T10:00'))).toBe(false);
  });

  it('multiple ranges on one line', () => {
    const split = 'Mo-Fr 09:00-12:00,13:00-18:00';
    expect(isWithinOpeningHours(split, at('2026-08-31T11:00'))).toBe(true);
    expect(isWithinOpeningHours(split, at('2026-08-31T12:30'))).toBe(false);
    expect(isWithinOpeningHours(split, at('2026-08-31T17:00'))).toBe(true);
    expect(getMinutesUntilClose(split, at('2026-08-31T11:00'))).toBe(60);
  });

  it('an unreadable line voids the whole value instead of closing the store', () => {
    const broken = 'Mo-Fr 09:00-18:00\nSa 25:00-30:00';
    expect(isValidOpeningHours(broken)).toBe(false);
    expect(isWithinOpeningHours(broken, at('2026-08-31T03:00'))).toBe(true);
  });

  it('validates the format', () => {
    expect(isValidOpeningHours('Mo-Fr,Su 09:00-12:00,13:00-18:00')).toBe(true);
    expect(isValidOpeningHours('')).toBe(true);
    expect(isValidOpeningHours('07:00-11:00')).toBe(false);
    expect(isValidOpeningHours('Mo-Su 18:00-02:00')).toBe(true);
    expect(isValidOpeningHours('Fr-Mo 09:00-18:00')).toBe(false);
  });

  it('days without a time range mean open all day', () => {
    const weekdays = 'Mo-Fr';
    expect(isValidOpeningHours(weekdays)).toBe(true);
    expect(isWithinOpeningHours(weekdays, at('2026-08-31T00:00'))).toBe(true);
    expect(isWithinOpeningHours(weekdays, at('2026-09-04T23:59'))).toBe(true);
    expect(isWithinOpeningHours(weekdays, at('2026-09-05T00:00'))).toBe(false);
    expect(getMinutesUntilClose(weekdays, at('2026-08-31T10:00'))).toBe(
      4 * 24 * 60 + 14 * 60,
    );
  });

  it('overnight range runs into the next day', () => {
    const overnight = 'Mo-Su 22:00-02:00';
    expect(isWithinOpeningHours(overnight, at('2026-08-31T23:30'))).toBe(true);
    expect(isWithinOpeningHours(overnight, at('2026-08-31T01:00'))).toBe(true);
    expect(isWithinOpeningHours(overnight, at('2026-08-31T02:00'))).toBe(false);
    expect(isWithinOpeningHours(overnight, at('2026-08-31T12:00'))).toBe(false);
    expect(getMinutesUntilClose(overnight, at('2026-08-31T23:30'))).toBe(150);
    expect(getMinutesUntilClose(overnight, at('2026-08-31T01:00'))).toBe(60);
  });

  it('overnight tail only reaches days that follow a listed day', () => {
    const monday = 'Mo 22:00-02:00';
    expect(isWithinOpeningHours(monday, at('2026-09-01T01:00'))).toBe(true);
    expect(isWithinOpeningHours(monday, at('2026-09-02T01:00'))).toBe(false);
  });

  it('00:00-00:00 means open all day', () => {
    const allDay = 'Mo-Su 00:00-00:00';
    expect(isValidOpeningHours(allDay)).toBe(true);
    expect(isWithinOpeningHours(allDay, at('2026-08-31T00:00'))).toBe(true);
    expect(isWithinOpeningHours(allDay, at('2026-08-31T23:59'))).toBe(true);
    expect(getMinutesUntilClose(allDay, at('2026-08-31T23:59'))).toBe(Infinity);

    const weekdaysOnly = 'Mo-Fr 00:00-00:00';
    expect(isWithinOpeningHours(weekdaysOnly, at('2026-09-04T23:59'))).toBe(
      true,
    );
    expect(isWithinOpeningHours(weekdaysOnly, at('2026-09-05T00:00'))).toBe(
      false,
    );
  });

  it('a store that never closes has unlimited minutes', () => {
    expect(getMinutesUntilClose('Mo-Su', at('2026-08-31T23:45'))).toBe(
      Infinity,
    );
    expect(
      getMinutesUntilClose('Mo-Fr 07:00-23:00\nSa-Su', at('2026-09-05T10:00')),
    ).toBe(38 * 60);
  });

  it('finds the close time across more contiguous segments than days', () => {
    expect(
      getMinutesUntilClose(
        'Mo-Fr 00:00-08:00,08:00-00:00',
        at('2026-08-31T00:00'),
      ),
    ).toBe(5 * 24 * 60);
  });

  it('rejects a value with an unreasonable number of ranges', () => {
    const ranges = (count: number) =>
      `Mo ${Array.from({ length: count }, () => '09:00-10:00').join(',')}`;

    expect(isValidOpeningHours(ranges(100))).toBe(true);
    expect(isValidOpeningHours(ranges(101))).toBe(false);
  });
});
