import {
  getCloseTimeOn,
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

  it('close time', () => {
    expect(getCloseTimeOn(hours, at('2026-08-31T09:00'))?.toISOString()).toBe(
      at('2026-08-31T18:00').toISOString(),
    );
    expect(getCloseTimeOn(hours, at('2026-09-06T12:00'))).toBeNull();
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
    expect(getCloseTimeOn(split, at('2026-08-31T11:00'))?.toISOString()).toBe(
      at('2026-08-31T12:00').toISOString(),
    );
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
    expect(isValidOpeningHours('Mo-Su 18:00-02:00')).toBe(false);
    expect(isValidOpeningHours('Fr-Mo 09:00-18:00')).toBe(false);
  });
});
