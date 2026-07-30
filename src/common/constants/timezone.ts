export const PLATFORM_TIMEZONE = 'Asia/Taipei';
export const PLATFORM_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export const STORE_UTC_OFFSET = '+08:00';
export const STORE_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export const toPlatformTime = (date: Date): Date =>
  new Date(date.getTime() + PLATFORM_UTC_OFFSET_MS);
