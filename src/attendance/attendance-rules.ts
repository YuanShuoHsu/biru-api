import { isIP } from 'node:net';

import { DAY_MS } from 'src/common/constants/timezone';
import {
  attendanceRequestStatus,
  type AttendanceEventAction,
  type CorrectedEvent,
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

export const AVAILABLE_PUNCH_ACTIONS = {
  scheduled: ['clockIn'],
  working: ['breakStart', 'clockOut'],
  resting: ['breakEnd'],
  completed: [],
} as const satisfies Record<ShiftState, readonly AttendanceEventAction[]>;

export function summarizeEvents(events: CorrectedEvent[], paidBreak: boolean) {
  let state: ShiftState = 'scheduled';
  let workedMs = 0;
  let breakMs = 0;
  let paidBreakMs = 0;
  let currentBreakPaid = paidBreak;
  let previous = 0;
  for (const event of events) {
    const time = new Date(event.occurredAt).getTime();
    if (!Number.isFinite(time) || (previous && time <= previous))
      throw badRequestError('invalidEventSequence');
    const allowed: readonly AttendanceEventAction[] =
      AVAILABLE_PUNCH_ACTIONS[state];
    if (!allowed.includes(event.action))
      throw badRequestError('invalidEventSequence');
    if (state === 'working') workedMs += time - previous;
    if (state === 'resting') {
      breakMs += time - previous;
      if (currentBreakPaid) paidBreakMs += time - previous;
    }
    if (event.action === 'breakStart')
      currentBreakPaid = event.paidBreak ?? paidBreak;
    state = SHIFT_STATE_BY_LAST_ACTION[event.action];
    previous = time;
  }
  return {
    state,
    availableActions: [...AVAILABLE_PUNCH_ACTIONS[state]],
    workedSeconds: Math.floor((workedMs + paidBreakMs) / 1000),
    breakSeconds: Math.floor(breakMs / 1000),
    unpaidBreakSeconds: Math.floor((breakMs - paidBreakMs) / 1000),
  };
}

export function assertEventSequence(
  events: CorrectedEvent[],
  paidBreak: boolean,
): void {
  summarizeEvents(events, paidBreak);
}

export function countedIntervals(events: CorrectedEvent[], paidBreak: boolean) {
  assertEventSequence(events, paidBreak);
  return events.slice(0, -1).flatMap((event, index) => {
    const counted =
      event.action === 'clockIn' ||
      event.action === 'breakEnd' ||
      (event.action === 'breakStart' && (event.paidBreak ?? paidBreak));
    return counted
      ? [
          {
            start: new Date(event.occurredAt).getTime(),
            end: new Date(events[index + 1].occurredAt).getTime(),
          },
        ]
      : [];
  });
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

export interface TimeInterval {
  start: number;
  end: number;
}

export interface ScheduledShift {
  startsAt: Date;
  endsAt: Date;
  paidBreak?: boolean;
  breakStartsAt?: Date | null;
  breakEndsAt?: Date | null;
}

export const hasScheduledUnpaidBreak = (shift: ScheduledShift) =>
  !shift.paidBreak && !!shift.breakStartsAt && !!shift.breakEndsAt;

export function scheduledWorkIntervals(shift: ScheduledShift): TimeInterval[] {
  const start = shift.startsAt.getTime(),
    end = shift.endsAt.getTime();
  if (!hasScheduledUnpaidBreak(shift)) return [{ start, end }];
  return [
    { start, end: shift.breakStartsAt!.getTime() },
    { start: shift.breakEndsAt!.getTime(), end },
  ].filter((interval) => interval.end > interval.start);
}

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
