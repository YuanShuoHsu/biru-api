import type { ShiftBreak } from 'src/db/schema/attendance';

import { badRequestError } from './attendance-errors';

export function parseInterval(start: string, end: string) {
  const startsAt = new Date(start),
    endsAt = new Date(end);
  if (endsAt <= startsAt) throw badRequestError('invalidInterval');
  return { startsAt, endsAt };
}

const BREAK_MS = 30 * 60000;

const MAX_CONTINUOUS_WORK_MS = 4 * 3600000;

export function scheduledBreaks(shift: {
  startsAt: Date;
  endsAt: Date;
}): ShiftBreak[] {
  const duration = shift.endsAt.getTime() - shift.startsAt.getTime();
  const count = Math.max(
    0,
    Math.ceil(
      (duration - MAX_CONTINUOUS_WORK_MS) / (MAX_CONTINUOUS_WORK_MS + BREAK_MS),
    ),
  );
  const work = duration - count * BREAK_MS;
  return Array.from({ length: count }, (_, index) => {
    const startsAt =
      shift.startsAt.getTime() +
      Math.round((work * (index + 1)) / (count + 1) / 60000) * 60000 +
      index * BREAK_MS;
    return {
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(startsAt + BREAK_MS).toISOString(),
    };
  });
}
