import { PLATFORM_UTC_OFFSET_MS } from '../constants/timezone';

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

type Day = (typeof DAYS)[number];

const DAYS_SET = new Set<string>(DAYS);

const MINUTES_PER_DAY = 24 * 60;

const MAX_SCHEDULES = 100;

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

    const days = parseDays(
      spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx),
    );
    if (!days) return null;

    const ranges =
      spaceIdx === -1
        ? [{ startMinutes: 0, endMinutes: 0 }]
        : parseRanges(trimmed.slice(spaceIdx + 1));
    if (!ranges) return null;

    for (const range of ranges) schedules.push({ days, ...range });

    if (schedules.length > MAX_SCHEDULES) return null;
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

const isOvernight = ({ startMinutes, endMinutes }: Range): boolean =>
  endMinutes <= startMinutes;

type SchedulesByDay = Record<Day, Schedule[]>;

const indexByDay = (schedules: Schedule[]): SchedulesByDay => {
  const byDay = Object.fromEntries(
    DAYS.map((day) => [day, [] as Schedule[]]),
  ) as SchedulesByDay;

  for (const schedule of schedules)
    for (const day of schedule.days) byDay[day].push(schedule);

  return byDay;
};

const minutesUntilSegmentEnd = (
  byDay: SchedulesByDay,
  at: Date,
): number | null => {
  const { day, minutes } = platformParts(at);

  const current = byDay[day].find((schedule) =>
    isOvernight(schedule)
      ? minutes >= schedule.startMinutes
      : minutes >= schedule.startMinutes && minutes < schedule.endMinutes,
  );
  if (current)
    return (
      current.endMinutes +
      (isOvernight(current) ? MINUTES_PER_DAY : 0) -
      minutes
    );

  const previous = byDay[DAYS[(DAYS.indexOf(day) + 6) % 7]].find(
    (schedule) => isOvernight(schedule) && minutes < schedule.endMinutes,
  );

  return previous ? previous.endMinutes - minutes : null;
};

export const isWithinOpeningHours = (
  value: string | null,
  at: Date,
): boolean => {
  const schedules = schedulesOf(value);
  if (schedules.length === 0) return true;

  return minutesUntilSegmentEnd(indexByDay(schedules), at) !== null;
};

export const getMinutesUntilClose = (
  value: string | null,
  at: Date,
): number => {
  const schedules = schedulesOf(value);
  if (schedules.length === 0) return Infinity;

  const byDay = indexByDay(schedules);
  const maxHops = schedules.reduce(
    (total, schedule) => total + schedule.days.length,
    0,
  );

  let cursor = at;
  let elapsed = 0;

  for (let hops = 0; hops <= maxHops; hops++) {
    const minutes = minutesUntilSegmentEnd(byDay, cursor);
    if (minutes === null) return elapsed;

    elapsed += minutes;
    cursor = new Date(cursor.getTime() + minutes * 60_000);
  }

  return Infinity;
};
