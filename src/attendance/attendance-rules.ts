import { isIP } from 'node:net';

import { DAY_MS } from 'src/common/constants/timezone';
import {
  attendanceRequestStatus,
  type AttendanceEventAction,
  type CorrectedEvent,
  type ShiftBreak,
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

export const CORRECTION_LEAD_MS = 12 * 3600000;

export const MAX_DAILY_WORK_SECONDS = 12 * 3600;

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

export function leadingIntervals(intervals: TimeInterval[], budgetMs: number) {
  let remaining = Math.max(0, budgetMs);
  return intervals.flatMap((interval) => {
    const end = Math.min(interval.end, interval.start + remaining);
    remaining -= Math.max(0, end - interval.start);
    return end > interval.start ? [{ start: interval.start, end }] : [];
  });
}
