import { DAY_MS, STORE_UTC_OFFSET } from 'src/common/constants/timezone';
import type { ShiftBreak, TemplateBreak } from 'src/db/schema/attendance';

import { badRequestError } from './attendance-errors';

export function parseInterval(start: string, end: string) {
  const startsAt = new Date(start),
    endsAt = new Date(end);
  if (endsAt <= startsAt) throw badRequestError('invalidInterval');
  return { startsAt, endsAt };
}

const MIN_BREAK_MS = 30 * 60000;

const MAX_CONTINUOUS_WORK_MS = 4 * 3600000;

export function parseBreaks(
  shift: { startsAt: Date; endsAt: Date },
  breaks: ShiftBreak[],
): ShiftBreak[] {
  const parsed = breaks
    .map((item) => ({
      startsAt: new Date(item.startsAt),
      endsAt: new Date(item.endsAt),
    }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  let workFrom = shift.startsAt.getTime();
  for (const { startsAt, endsAt } of parsed) {
    if (
      startsAt.getTime() < workFrom ||
      endsAt <= startsAt ||
      endsAt > shift.endsAt
    )
      throw badRequestError('invalidBreak');
    if (endsAt.getTime() - startsAt.getTime() < MIN_BREAK_MS)
      throw badRequestError('breakTooShort');
    if (startsAt.getTime() - workFrom > MAX_CONTINUOUS_WORK_MS)
      throw badRequestError('continuousWorkTooLong');
    workFrom = endsAt.getTime();
  }
  if (shift.endsAt.getTime() - workFrom > MAX_CONTINUOUS_WORK_MS)
    throw badRequestError('continuousWorkTooLong');
  return parsed.map(({ startsAt, endsAt }) => ({
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  }));
}

export function templateShift(
  startDay: string,
  template: {
    startTime: string;
    endTime: string;
    breaks: TemplateBreak[];
  },
) {
  const at = (time: string, dayOffset: number) =>
    new Date(
      new Date(`${startDay}T${time}:00${STORE_UTC_OFFSET}`).getTime() +
        dayOffset * DAY_MS,
    ).toISOString();
  const { startTime } = template;
  return {
    startsAt: at(startTime, 0),
    endsAt: at(template.endTime, template.endTime <= startTime ? 1 : 0),
    breaks: template.breaks.map(({ startTime: breakStart, endTime }) => {
      const breakDay = breakStart < startTime ? 1 : 0;
      return {
        startsAt: at(breakStart, breakDay),
        endsAt: at(endTime, breakDay + (endTime <= breakStart ? 1 : 0)),
      };
    }),
  };
}
