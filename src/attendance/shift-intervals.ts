import { DAY_MS, STORE_UTC_OFFSET } from 'src/common/constants/timezone';

import { badRequestError } from './attendance-errors';

export function parseInterval(start: string, end: string) {
  const startsAt = new Date(start),
    endsAt = new Date(end);
  if (endsAt <= startsAt) throw badRequestError('invalidInterval');
  return { startsAt, endsAt };
}

export function parseBreakWindow(
  shift: { startsAt: Date; endsAt: Date },
  start: string | undefined,
  end: string | undefined,
) {
  if (!start && !end) return { breakStartsAt: null, breakEndsAt: null };
  const breakStartsAt = start ? new Date(start) : null,
    breakEndsAt = end ? new Date(end) : null;
  if (
    !breakStartsAt ||
    !breakEndsAt ||
    breakStartsAt < shift.startsAt ||
    breakEndsAt <= breakStartsAt ||
    breakEndsAt > shift.endsAt
  )
    throw badRequestError('invalidBreak');
  return { breakStartsAt, breakEndsAt };
}

export function templateShift(
  startDay: string,
  template: {
    startTime: string;
    endTime: string;
    nextDay: boolean;
    breakStartTime?: string | null;
    breakEndTime?: string | null;
  },
) {
  const at = (time: string, dayOffset: number) =>
    new Date(
      new Date(`${startDay}T${time}:00${STORE_UTC_OFFSET}`).getTime() +
        dayOffset * DAY_MS,
    ).toISOString();
  const { startTime, breakStartTime, breakEndTime } = template;
  const breakDay = breakStartTime && breakStartTime < startTime ? 1 : 0;
  const breakEndDay =
    breakDay +
    (breakStartTime && breakEndTime && breakEndTime <= breakStartTime ? 1 : 0);
  return {
    startsAt: at(startTime, 0),
    endsAt: at(template.endTime, template.nextDay ? 1 : 0),
    breakStartsAt: breakStartTime ? at(breakStartTime, breakDay) : undefined,
    breakEndsAt: breakEndTime ? at(breakEndTime, breakEndDay) : undefined,
  };
}
