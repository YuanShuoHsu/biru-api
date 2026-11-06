import { BadRequestException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const reportErrorCodes = ['rangeInvalid', 'rangeTooLong'] as const;

export type ReportErrorCode = (typeof reportErrorCodes)[number];

export const badRequestError = (code: ReportErrorCode) =>
  new BadRequestException({
    error: 'Bad Request',
    code,
    message:
      I18nContext.current<I18nTranslations>()?.t(`common.reports.${code}`) ??
      code,
  });
