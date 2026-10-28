import {
  DAY_MS,
  platformDayNumber,
  toPlatformTime,
} from '../constants/timezone.js';

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

export const openingWeekdays = (value: string | null) =>
  new Set(
    schedulesOf(value).flatMap(({ days }) =>
      days.map((day) => DAYS.indexOf(day)),
    ),
  );

const platformParts = (at: Date) => {
  const shifted = toPlatformTime(at);

  return {
    day: platformDayNumber(at.getTime()),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
};

const dayNumberOf = (date: string): number => Date.parse(date) / DAY_MS;

const weekdayOf = (dayNumber: number): Day =>
  DAYS[(((dayNumber + 3) % 7) + 7) % 7];

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

type SchedulesOn = (dayNumber: number) => Schedule[];

const minutesUntilSegmentEnd = (
  schedulesOn: SchedulesOn,
  at: Date,
): number | null => {
  const { day, minutes } = platformParts(at);

  const current = schedulesOn(day).find((schedule) =>
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

  const previous = schedulesOn(day - 1).find(
    (schedule) => isOvernight(schedule) && minutes < schedule.endMinutes,
  );

  return previous ? previous.endMinutes - minutes : null;
};

const ALL_DAY: Schedule = { days: [...DAYS], endMinutes: 0, startMinutes: 0 };

export interface SpecialOpeningHours {
  openingHours: string | null;
  validFrom: string;
  validThrough: string;
}

export interface OpeningCalendar {
  isOpenAt: (at: Date) => boolean;
  minutesUntilClose: (at: Date) => number;
}

export const openingCalendar = (
  weekly: string | null,
  specials: SpecialOpeningHours[],
): OpeningCalendar => {
  const weeklySchedules = schedulesOf(weekly);
  const weeklyByDay = indexByDay(
    weeklySchedules.length ? weeklySchedules : [ALL_DAY],
  );
  const weeklyHops = Object.values(weeklyByDay).reduce(
    (total, schedules) => total + schedules.length,
    0,
  );

  const specialDays = specials.map((special) => ({
    byDay: indexByDay(
      special.openingHours === null ? [] : schedulesOf(special.openingHours),
    ),
    from: dayNumberOf(special.validFrom),
    through: dayNumberOf(special.validThrough),
  }));
  const lastSpecialDay = Math.max(
    -Infinity,
    ...specialDays.map(({ through }) => through),
  );

  const schedulesOn: SchedulesOn = (dayNumber) =>
    (specialDays.find(
      ({ from, through }) => from <= dayNumber && dayNumber <= through,
    )?.byDay ?? weeklyByDay)[weekdayOf(dayNumber)];

  return {
    isOpenAt: (at) => minutesUntilSegmentEnd(schedulesOn, at) !== null,

    minutesUntilClose: (at) => {
      let cursor = at;
      let elapsed = 0;
      let hopsPastSpecials = 0;

      for (;;) {
        if (
          !(platformDayNumber(cursor.getTime()) <= lastSpecialDay + 1) &&
          hopsPastSpecials++ > weeklyHops
        )
          return Infinity;

        const minutes = minutesUntilSegmentEnd(schedulesOn, cursor);
        if (minutes === null) return elapsed;

        elapsed += minutes;
        cursor = new Date(cursor.getTime() + minutes * 60_000);
      }
    },
  };
};

export const isWithinOpeningHours = (value: string | null, at: Date): boolean =>
  openingCalendar(value, []).isOpenAt(at);
