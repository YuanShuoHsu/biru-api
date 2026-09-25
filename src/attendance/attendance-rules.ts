import { isIP } from 'node:net';

import {
  DAY_MS,
  platformDateString,
  platformMidnight,
} from 'src/common/constants/timezone';
import {
  attendanceRequestStatus,
  type AttendanceDayKind,
  type AttendanceEventAction,
  type AttendanceLegalStatus,
  type AttendanceScheduledDayKind,
  type AttendanceTerminationReason,
  type CorrectedEvent,
  type ShiftBreak,
  type DatePeriod,
} from 'src/db/schema/attendance';

import { badRequestError } from './attendance-errors';

export function normalizeIp(ip: string): string {
  const value = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (!isIP(value)) throw badRequestError('invalidIp');
  return isIP(value) === 6
    ? new URL(`http://[${value}]`).hostname.slice(1, -1)
    : value;
}

export function normalizeIpRange(range: string): string {
  const [address, prefix, ...rest] = range.split('/');
  const ip = normalizeIp(address);
  if (prefix === undefined) return ip;
  const bits = Number(prefix);
  if (
    rest.length ||
    !/^\d{1,3}$/.test(prefix) ||
    bits > (isIP(ip) === 4 ? 32 : 128)
  )
    throw badRequestError('invalidIp');
  return `${ip}/${bits}`;
}

const ipBytes = (ip: string): number[] => {
  if (isIP(ip) === 4) return ip.split('.').map(Number);
  const [head, tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [
        ...left,
        ...Array<string>(8 - left.length - right.length).fill('0'),
        ...right,
      ]
    : left;
  return groups.flatMap((group) => {
    const word = parseInt(group, 16);
    return [word >>> 8, word & 255];
  });
};

export function ipInRange(ip: string, range: string): boolean {
  const [network, prefix] = range.split('/');
  const version = isIP(network);
  if (isIP(ip) !== version) return false;
  const bits =
    prefix === undefined ? (version === 4 ? 32 : 128) : Number(prefix);
  const address = ipBytes(ip),
    target = ipBytes(network);
  for (let index = 0; index * 8 < bits; index += 1) {
    const mask = 255 ^ (255 >>> Math.min(8, bits - index * 8));
    if ((address[index] & mask) !== (target[index] & mask)) return false;
  }
  return true;
}

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export type ShiftState = 'scheduled' | 'working' | 'resting' | 'completed';

export const SHIFT_STATE_RANK: Record<ShiftState, number> = {
  scheduled: 0,
  working: 1,
  resting: 2,
  completed: 3,
};

export const SHIFT_STATE_BY_LAST_ACTION = {
  clockIn: 'working',
  breakStart: 'resting',
  breakEnd: 'working',
  clockOut: 'completed',
} as const satisfies Record<AttendanceEventAction, ShiftState>;

// 舊資料含休息打卡，讀取時仍要接受 breakStart/breakEnd，新打卡則不再提供
const EVENT_TRANSITIONS = {
  scheduled: ['clockIn'],
  working: ['breakStart', 'clockOut'],
  resting: ['breakEnd'],
  completed: [],
} as const satisfies Record<ShiftState, readonly AttendanceEventAction[]>;

export const AVAILABLE_PUNCH_ACTIONS = {
  scheduled: ['clockIn'],
  working: ['clockOut'],
  resting: ['breakEnd'],
  completed: [],
} as const satisfies Record<ShiftState, readonly AttendanceEventAction[]>;

export interface BreakPolicy {
  paidBreak: boolean;
  breaks?: ShiftBreak[];
}

function punchedTimeline(events: CorrectedEvent[], paidBreak: boolean) {
  let state: ShiftState = 'scheduled';
  let currentBreakPaid = paidBreak;
  let previous = 0;
  const worked: TimeInterval[] = [];
  const breaks: (TimeInterval & { paid: boolean })[] = [];
  for (const event of events) {
    const time = new Date(event.occurredAt).getTime();
    if (!Number.isFinite(time) || (previous && time <= previous))
      throw badRequestError('invalidEventSequence');
    const allowed: readonly AttendanceEventAction[] = EVENT_TRANSITIONS[state];
    if (!allowed.includes(event.action))
      throw badRequestError('invalidEventSequence');
    if (state === 'working') worked.push({ start: previous, end: time });
    if (state === 'resting')
      breaks.push({ start: previous, end: time, paid: currentBreakPaid });
    if (event.action === 'breakStart')
      currentBreakPaid = event.paidBreak ?? paidBreak;
    state = SHIFT_STATE_BY_LAST_ACTION[event.action];
    previous = time;
  }
  return { state, worked, breaks };
}

const totalMs = (intervals: TimeInterval[]) =>
  intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);

function countedFrom(
  { worked, breaks }: ReturnType<typeof punchedTimeline>,
  shift: BreakPolicy,
) {
  if (breaks.length)
    return [...worked, ...breaks.filter((interval) => interval.paid)].sort(
      (a, b) => a.start - b.start,
    );
  return subtractIntervals(worked, unpaidBreakIntervals(shift));
}

export const punchedUnpaidBreaks = (
  events: CorrectedEvent[],
  shift: BreakPolicy,
): TimeInterval[] =>
  punchedTimeline(events, shift.paidBreak).breaks.filter(
    (interval) => !interval.paid,
  );

export const countedIntervals = (
  events: CorrectedEvent[],
  shift: BreakPolicy,
) => countedFrom(punchedTimeline(events, shift.paidBreak), shift);

export function summarizeEvents(events: CorrectedEvent[], shift: BreakPolicy) {
  const timeline = punchedTimeline(events, shift.paidBreak);
  const { state, worked, breaks } = timeline;
  const scheduled = breaks.length
    ? []
    : breakIntervals(shift).flatMap((interval) =>
        overlapIntervals(worked, interval.start, interval.end),
      );
  const unpaidBreakMs =
    totalMs(breaks.filter((interval) => !interval.paid)) +
    (shift.paidBreak ? 0 : totalMs(scheduled));
  const availableActions: AttendanceEventAction[] = [
    ...AVAILABLE_PUNCH_ACTIONS[state],
  ];
  return {
    state,
    availableActions,
    workedSeconds: Math.floor(totalMs(countedFrom(timeline, shift)) / 1000),
    breakSeconds: Math.floor((totalMs(breaks) + totalMs(scheduled)) / 1000),
    unpaidBreakSeconds: Math.floor(unpaidBreakMs / 1000),
  };
}

export const blockingRequestStatuses = [
  'pending',
  'approved',
  'cancellationPending',
] satisfies (typeof attendanceRequestStatus.enumValues)[number][];

export const countedRequestStatuses = [
  'approved',
  'cancellationPending',
] satisfies (typeof attendanceRequestStatus.enumValues)[number][];

export const MAX_SHIFT_MS = DAY_MS;

export const MAX_DAILY_WORK_SECONDS = 12 * 3600;

export const STUDENT_WEEKLY_WORK_SECONDS = 20 * 3600;

export const weekStartOfDate = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`);
  return day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS;
};

export const withinPeriods = (periods: DatePeriod[], date: string) =>
  periods.some(({ from, to }) => from <= date && date <= to);

export const workPermitRequired = (legalStatus: AttendanceLegalStatus) =>
  legalStatus === 'permanentResident' ||
  legalStatus === 'foreignStudent' ||
  legalStatus === 'otherForeigner';

export const exceedsStudentWeeklyLimit = (
  days: { date: string; seconds: number }[],
  vacations: DatePeriod[],
) => {
  const weeks = new Map<number, number>();
  for (const { date, seconds } of days) {
    if (withinPeriods(vacations, date)) continue;
    const monday = weekStartOfDate(date);
    weeks.set(monday, (weeks.get(monday) ?? 0) + seconds);
  }
  return [...weeks.values()].some(
    (seconds) => seconds > STUDENT_WEEKLY_WORK_SECONDS,
  );
};

export const NOTICE_TERMINATION_REASONS: readonly AttendanceTerminationReason[] =
  ['layoff', 'forceMajeure', 'reorganization'];

export const SEVERANCE_TERMINATION_REASONS: readonly AttendanceTerminationReason[] =
  [...NOTICE_TERMINATION_REASONS, 'employerBreach'];

export const JOB_SEARCH_DAYS_PER_WEEK = 2;

export const MAX_MONTHLY_OVERTIME_SECONDS = 46 * 3600;

export const EXTENDED_MONTHLY_OVERTIME_SECONDS = 54 * 3600;

export const EXTENDED_PERIOD_OVERTIME_SECONDS = 138 * 3600;

export const OVERTIME_EXTENSION_MONTHS = 3;

const monthNumber = (month: string) => {
  const [year, index] = month.split('-').map(Number);
  return year * 12 + index - 1;
};

export const overtimeExtensionPeriodOf = (
  periods: string[],
  year: number,
  monthIndex: number,
) => {
  const target = year * 12 + monthIndex;
  const start = periods
    .map(monthNumber)
    .find(
      (first) => target >= first && target < first + OVERTIME_EXTENSION_MONTHS,
    );
  return start === undefined
    ? null
    : { year: Math.floor(start / 12), monthIndex: start % 12 };
};

export const hasOverlappingOvertimeExtensions = (periods: string[]) =>
  periods
    .map(monthNumber)
    .sort((a, b) => a - b)
    .some(
      (start, index, sorted) =>
        index > 0 && start - sorted[index - 1] < OVERTIME_EXTENSION_MONTHS,
    );

export interface TimeInterval {
  start: number;
  end: number;
}

export interface ScheduledShift extends Partial<BreakPolicy> {
  startsAt: Date;
  endsAt: Date;
}

const breakIntervals = (shift: Partial<BreakPolicy>): TimeInterval[] =>
  (shift.breaks ?? []).map((item) => ({
    start: new Date(item.startsAt).getTime(),
    end: new Date(item.endsAt).getTime(),
  }));

const unpaidBreakIntervals = (shift: Partial<BreakPolicy>) =>
  shift.paidBreak ? [] : breakIntervals(shift);

export function subtractIntervals(
  intervals: TimeInterval[],
  cuts: TimeInterval[],
): TimeInterval[] {
  return cuts.reduce(
    (remaining, cut) =>
      remaining.flatMap((interval) =>
        [
          { start: interval.start, end: Math.min(interval.end, cut.start) },
          { start: Math.max(interval.start, cut.end), end: interval.end },
        ].filter((part) => part.end > part.start),
      ),
    intervals,
  );
}

export const intersectIntervals = (
  intervals: TimeInterval[],
  within: TimeInterval[],
) => subtractIntervals(intervals, subtractIntervals(intervals, within));

export const scheduledWorkIntervals = (shift: ScheduledShift) =>
  subtractIntervals(
    [{ start: shift.startsAt.getTime(), end: shift.endsAt.getTime() }],
    unpaidBreakIntervals(shift),
  );

const WEEKLY_REST_DAYS = 2;

export const weekdayOfDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).getUTCDay();

interface RestWeekdays {
  regularLeaveWeekday: number | null;
  restDayWeekday: number | null;
}

export const designatedDayKind = (
  employee: RestWeekdays,
  weekday: number,
): AttendanceScheduledDayKind | null => {
  if (employee.regularLeaveWeekday === null) return null;
  return weekday === employee.regularLeaveWeekday
    ? 'regularLeave'
    : weekday === employee.restDayWeekday
      ? 'restDay'
      : 'workday';
};

export const restDayDesignationConflict = (
  employee: RestWeekdays,
  date: string,
  dayKind: AttendanceDayKind,
) => {
  const designated = designatedDayKind(employee, weekdayOfDate(date));
  return designated !== null && dayKind !== designated;
};

export const INDIGENOUS_HOLIDAY_NAME = '原住民族歲時祭儀';

export const INDIGENOUS_HOLIDAYS_PER_YEAR = 3;

export const employeeHolidays = (
  statutory: { date: string; name: string }[],
  employee: { indigenousHolidays: string[] },
) =>
  [
    ...statutory,
    ...employee.indigenousHolidays
      .filter((date) => !statutory.some((holiday) => holiday.date === date))
      .map((date) => ({ date, name: INDIGENOUS_HOLIDAY_NAME })),
  ].sort((a, b) => a.date.localeCompare(b.date));

// 施行細則 §23-1 但書：中央主管機關指定應放假之日（選舉、公投投票日）不補假
const substitutable = ({ name }: { name: string }) => !name.includes('投票');

export function owedHolidaySubstitutes({
  employedFrom,
  employedUntil,
  holidays,
  restWeekdays,
  shifts,
  substituteShiftIds,
}: {
  employedFrom: string;
  employedUntil: string | null;
  holidays: { date: string; name: string }[];
  restWeekdays: number[] | null;
  shifts: { id: string; startsAt: Date; dayKind: AttendanceDayKind }[];
  substituteShiftIds: Set<string>;
}) {
  const employed = (date: string) =>
    date >= employedFrom && (!employedUntil || date < employedUntil);
  const eligible = holidays.filter(
    (holiday) => substitutable(holiday) && employed(holiday.date),
  );
  if (restWeekdays)
    return eligible
      .filter(({ date }) => restWeekdays.includes(weekdayOfDate(date)))
      .map(({ date }) => date);
  const owed: string[] = [];
  const weeks = [...new Set(eligible.map(({ date }) => weekStartOfDate(date)))];
  for (const week of weeks) {
    const dates = Array.from({ length: 7 }, (_, day) =>
      new Date(week + day * DAY_MS).toISOString().slice(0, 10),
    );
    if (!dates.every(employed)) continue;
    const holidayDates = new Set(
      holidays
        .filter(({ date }) => dates.includes(date))
        .map(({ date }) => date),
    );
    const workdays = new Set(
      shifts
        .filter(
          (shift) =>
            shift.dayKind === 'workday' || substituteShiftIds.has(shift.id),
        )
        .map((shift) => platformDateString(shift.startsAt))
        .filter((date) => dates.includes(date) && !holidayDates.has(date)),
    );
    const shortfall = Math.max(
      0,
      WEEKLY_REST_DAYS - (7 - holidayDates.size - workdays.size),
    );
    const weekEligible = eligible.filter(({ date }) => dates.includes(date));
    if (shortfall)
      owed.push(...weekEligible.slice(-shortfall).map(({ date }) => date));
  }
  return owed;
}

const OVERTIME_REVIEW_MIN_MS = 60 * 1000;

// 勞動事件法 §38：出勤紀錄內的時間推定經雇主同意執行職務，排班外的打卡時數要有人審過才能結算
export const unreviewedOvertime = (
  counted: TimeInterval[],
  shift: ScheduledShift,
  reviewed: TimeInterval[],
) =>
  subtractIntervals(counted, [
    ...scheduledWorkIntervals(shift),
    ...reviewed,
  ]).filter(({ start, end }) => end - start >= OVERTIME_REVIEW_MIN_MS);

export const overlapMs = (interval: TimeInterval, from: number, to: number) =>
  Math.max(0, Math.min(interval.end, to) - Math.max(interval.start, from));

export function overlapIntervals(
  intervals: TimeInterval[],
  start: number,
  end: number,
) {
  return intervals
    .map((interval) => ({
      start: Math.max(start, interval.start),
      end: Math.min(end, interval.end),
    }))
    .filter((interval) => interval.end > interval.start);
}

export const scheduledWorkSeconds = (
  shift: ScheduledShift,
  from = -Infinity,
  to = Infinity,
) =>
  Math.floor(
    scheduledWorkIntervals(shift).reduce(
      (total, interval) => total + overlapMs(interval, from, to),
      0,
    ) / 1000,
  );

export const punchLeewayMs = (shift: ScheduledShift) =>
  Math.max(0, MAX_DAILY_WORK_SECONDS - scheduledWorkSeconds(shift)) * 1000;

export function leadingIntervals(intervals: TimeInterval[], budgetMs: number) {
  let remaining = Math.max(0, budgetMs);
  return intervals.flatMap((interval) => {
    const end = Math.min(interval.end, interval.start + remaining);
    remaining -= Math.max(0, end - interval.start);
    return end > interval.start ? [{ start: interval.start, end }] : [];
  });
}

export const ageOn = (birthDate: string, date: string) => {
  const [birthYear, birthMonthDay] = [
    Number(birthDate.slice(0, 4)),
    birthDate.slice(5),
  ];

  return (
    Number(date.slice(0, 4)) -
    birthYear -
    (date.slice(5) < birthMonthDay ? 1 : 0)
  );
};

export const MINIMUM_WORKING_AGE = 15;

export const ADULT_WORKING_AGE = 16;

export const MIN_SHIFT_REST_MS = 11 * 3600 * 1000;

const CHILD_DAILY_WORK_SECONDS = 8 * 3600;

const CHILD_WEEKLY_WORK_SECONDS = 40 * 3600;

interface PlannedShift extends ScheduledShift {
  dayKind: AttendanceDayKind;
}

export const lacksWeeklyRest = (shifts: PlannedShift[]) => {
  const weeks = new Map<number, { worked: Set<string>; busy: Set<string> }>();
  for (const shift of shifts) {
    const date = platformDateString(shift.startsAt);
    const week = weekStartOfDate(date);
    const days = weeks.get(week) ?? { worked: new Set(), busy: new Set() };
    if (shift.dayKind === 'workday' || shift.dayKind === 'holiday')
      days.worked.add(date);
    if (shift.dayKind !== 'regularLeave') days.busy.add(date);
    weeks.set(week, days);
  }

  return [...weeks.values()].some(
    ({ busy, worked }) => worked.size > 5 || busy.size > 6,
  );
};

export const hasShortRestBetweenShifts = (
  shifts: ScheduledShift[],
  isChecked: (shift: ScheduledShift) => boolean,
) =>
  [...shifts]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .some(
      (shift, index, sorted) =>
        index > 0 &&
        (isChecked(shift) || isChecked(sorted[index - 1])) &&
        platformDateString(shift.startsAt) !==
          platformDateString(sorted[index - 1].startsAt) &&
        shift.startsAt.getTime() - sorted[index - 1].endsAt.getTime() <
          MIN_SHIFT_REST_MS,
    );

const MATERNAL_NIGHT_START_MS = 22 * 3600 * 1000;

const MATERNAL_NIGHT_END_MS = 30 * 3600 * 1000;

export const maternalProtectionPeriods = (employee: {
  pregnancyPeriods: DatePeriod[];
  nursingPeriods: DatePeriod[];
}) => [...employee.pregnancyPeriods, ...employee.nursingPeriods];

const NURSING_SECONDS = 3600;

const OVERTIME_NURSING_SECONDS = 1800;

export const nursingAllowanceSeconds = (
  nursingPeriods: DatePeriod[],
  date: string,
  overtimeSeconds: number,
) =>
  withinPeriods(nursingPeriods, date)
    ? NURSING_SECONDS + (overtimeSeconds >= 3600 ? OVERTIME_NURSING_SECONDS : 0)
    : 0;

export const maternalNightWork = (
  intervals: TimeInterval[],
  protectedPeriods: DatePeriod[],
) =>
  intervals.some(({ start, end }) =>
    [platformMidnight(start) - DAY_MS, platformMidnight(start)].some(
      (night) =>
        start < night + MATERNAL_NIGHT_END_MS &&
        end > night + MATERNAL_NIGHT_START_MS &&
        [night, night + DAY_MS].some((day) =>
          withinPeriods(protectedPeriods, platformDateString(new Date(day))),
        ),
    ),
  );

export const childLaborViolation = (shifts: PlannedShift[]) => {
  const days = new Map<string, number>();
  const weeks = new Map<number, number>();
  for (const shift of shifts) {
    if (shift.dayKind === 'regularLeave') return 'childLaborRestDay' as const;
    const midnight = platformMidnight(shift.startsAt.getTime());
    if (
      [midnight - DAY_MS, midnight].some(
        (day) =>
          shift.startsAt.getTime() < day + 30 * 3600 * 1000 &&
          shift.endsAt.getTime() > day + 20 * 3600 * 1000,
      )
    )
      return 'childLaborNightWork' as const;
    const date = platformDateString(shift.startsAt);
    const seconds = scheduledWorkSeconds(shift);
    days.set(date, (days.get(date) ?? 0) + seconds);
    const week = weekStartOfDate(date);
    weeks.set(week, (weeks.get(week) ?? 0) + seconds);
  }
  if (
    [...days.values()].some((seconds) => seconds > CHILD_DAILY_WORK_SECONDS) ||
    [...weeks.values()].some((seconds) => seconds > CHILD_WEEKLY_WORK_SECONDS)
  )
    return 'childLaborHoursExceeded' as const;

  return null;
};
