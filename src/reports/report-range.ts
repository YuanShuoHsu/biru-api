import { BadRequestException } from '@nestjs/common';

import { I18nContext, type I18nService } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

import { DAY_MS } from '../common/constants/timezone.js';

import type { ReportRangeQueryDto } from './dto/report-range-query.dto.js';

const MAX_RANGE_DAYS = 366;

export const parseReportRange = (
  range: ReportRangeQueryDto,
  i18n: I18nService<I18nTranslations>,
): { since: Date; until: Date } => {
  const t = (key: keyof I18nTranslations['common']['reports']) =>
    i18n.t(`common.reports.${key}`, { lang: I18nContext.current()?.lang });

  const since = new Date(range.since);
  const until = new Date(range.until);
  if (until <= since) throw new BadRequestException(t('rangeInvalid'));
  if (until.getTime() - since.getTime() > MAX_RANGE_DAYS * DAY_MS)
    throw new BadRequestException(t('rangeTooLong'));

  return { since, until };
};
