import { DAY_MS } from '../common/constants/timezone.js';

import type { ReportRangeQueryDto } from './dto/report-range-query.dto.js';
import { badRequestError } from './report-errors.js';

const MAX_RANGE_DAYS = 366;

export const parseReportRange = (
  range: ReportRangeQueryDto,
): { since: Date; until: Date } => {
  const since = new Date(range.since);
  const until = new Date(range.until);
  if (until <= since) throw badRequestError('rangeInvalid');
  if (until.getTime() - since.getTime() > MAX_RANGE_DAYS * DAY_MS)
    throw badRequestError('rangeTooLong');

  return { since, until };
};
