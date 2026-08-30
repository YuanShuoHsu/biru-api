import { PLATFORM_UTC_OFFSET_MS } from '../constants/timezone';

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

type Day = (typeof DAYS)[number];

const DAYS_SET = new Set<string>(DAYS);

const isDayCode = (code: string): code is Day => DAYS_SET.has(code);

const parseDays = (daysPart: string): Day[] | null => {
  const days = new Set<Day>();

  for (const segment of daysPart.split(',')) {
    const parts = segment.split('-');

    if (parts.length === 1) {
      if (!isDayCode(parts[0])) return null;
      days.add(parts[0]);
      continue;
    }

    if (parts.length !== 2 || !isDayCode(parts[0]) || !isDayCode(parts[1]))
      return null;

    const startIdx = DAYS.indexOf(parts[0]);
    const endIdx = DAYS.indexOf(parts[1]);
    if (startIdx > endIdx) return null;

    for (const day of DAYS.slice(startIdx, endIdx + 1)) days.add(day);
  }

  return days.size === 0 ? null : [...days];
};

const toMinutes = (time: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
};

interface Range {
  startMinutes: number;
  endMinutes: number;
}

const parseRanges = (timePart: string): Range[] | null => {
  const ranges: Range[] = [];

  for (const segment of timePart.split(',')) {
    const dashIdx = segment.indexOf('-');
    if (dashIdx === -1) return null;

    const startMinutes = toMinutes(segment.slice(0, dashIdx).trim());
    const endMinutes = toMinutes(segment.slice(dashIdx + 1).trim());
    if (startMinutes === null || endMinutes === null) return null;

    // 後台以 minTime/maxTime 互鎖，跨午夜營業要拆成兩段輸入，這裡不另作解讀
    if (endMinutes <= startMinutes) return null;

    ranges.push({ startMinutes, endMinutes });
  }

  return ranges.length === 0 ? null : ranges;
};

interface Schedule extends Range {
  days: Day[];
}

const parseOpeningHours = (value: string): Schedule[] | null => {
  const schedules: Schedule[] = [];

  for (const line of value.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) return null;

    const days = parseDays(trimmed.slice(0, spaceIdx));
    if (!days) return null;

    const ranges = parseRanges(trimmed.slice(spaceIdx + 1));
    if (!ranges) return null;

    for (const range of ranges) schedules.push({ days, ...range });
  }

  return schedules;
};

export const isValidOpeningHours = (value: string): boolean =>
  parseOpeningHours(value) !== null;

const schedulesOf = (value: string | null): Schedule[] =>
  parseOpeningHours(value || '') ?? [];

const platformParts = (at: Date) => {
  const shifted = new Date(at.getTime() + PLATFORM_UTC_OFFSET_MS);

  return {
    day: DAYS[(shifted.getUTCDay() + 6) % 7],
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
};

const scheduleAt = (value: string | null, at: Date): Schedule | undefined => {
  const { day, minutes } = platformParts(at);

  return schedulesOf(value).find(
    ({ days, startMinutes, endMinutes }) =>
      days.includes(day) && minutes >= startMinutes && minutes < endMinutes,
  );
};

export const isWithinOpeningHours = (
  value: string | null,
  at: Date,
): boolean => {
  const schedules = schedulesOf(value);
  if (schedules.length === 0) return true;

  return scheduleAt(value, at) !== undefined;
};

export const getCloseTimeOn = (value: string | null, at: Date): Date | null => {
  const schedule = scheduleAt(value, at);
  if (!schedule) return null;

  const { minutes } = platformParts(at);

  return new Date(at.getTime() + (schedule.endMinutes - minutes) * 60_000);
};
