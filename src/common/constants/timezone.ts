export const PLATFORM_TIMEZONE = 'Asia/Taipei';
export const PLATFORM_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export const STORE_UTC_OFFSET = '+08:00';
export const STORE_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export const toPlatformTime = (date: Date): Date =>
  new Date(date.getTime() + PLATFORM_UTC_OFFSET_MS);

export const DAY_MS = 24 * 60 * 60 * 1000;

export const platformDayNumber = (time: number): number =>
  Math.floor((time + PLATFORM_UTC_OFFSET_MS) / DAY_MS);

export const platformMidnight = (time: number): number =>
  platformDayNumber(time) * DAY_MS - PLATFORM_UTC_OFFSET_MS;

export const platformMonthStart = (year: number, monthIndex: number): Date =>
  new Date(Date.UTC(year, monthIndex, 1) - PLATFORM_UTC_OFFSET_MS);

export const platformDateString = (date: Date): string =>
  toPlatformTime(date).toISOString().slice(0, 10);
