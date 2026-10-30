import { BadRequestException, NotFoundException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const couponErrorCodes = [
  'applicableOrganizationNotFound',
  'couponNotFound',
] as const;

export type CouponErrorCode = (typeof couponErrorCodes)[number];

const errorBody = (code: CouponErrorCode) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.coupons.${code}`) ??
    code,
});

export const badRequestError = (code: CouponErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const notFoundError = (code: CouponErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
