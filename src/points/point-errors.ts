import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const pointErrorCodes = [
  'adjustOwnerOnly',
  'adjustSelf',
  'insufficient',
  'notEnabled',
  'notRedeemable',
  'perUserLimitReached',
] as const;

export type PointErrorCode = (typeof pointErrorCodes)[number];

const errorBody = (code: PointErrorCode, args?: Record<string, unknown>) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.points.${code}`, {
      args,
    }) ?? code,
});

export const badRequestError = (code: PointErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const forbiddenError = (
  code: PointErrorCode,
  args?: Record<string, unknown>,
) => new ForbiddenException({ error: 'Forbidden', ...errorBody(code, args) });
