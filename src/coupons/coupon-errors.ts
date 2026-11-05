import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const couponErrorCodes = [
  'alreadyClaimed',
  'applicableOrganizationNotFound',
  'codeExists',
  'couponNotFound',
  'expired',
  'grantExpired',
  'grantInactive',
  'inUse',
  'issueMinSpendRequired',
  'itemScopeSingleOrganization',
  'itemScopeTargetsRequired',
  'memberNotFound',
  'memberOnly',
  'minSubtotal',
  'notApplicable',
  'notApplicableHere',
  'notFound',
  'notGrantable',
  'notYetValid',
  'organizationClosed',
  'perUserLimitReached',
  'percentageTooHigh',
  'pointsOnly',
  'scheduleInvalid',
  'usedUp',
] as const;

export type CouponErrorCode = (typeof couponErrorCodes)[number];

const errorBody = (code: CouponErrorCode, args?: Record<string, unknown>) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.coupons.${code}`, {
      args,
    }) ?? code,
});

export const badRequestError = (
  code: CouponErrorCode,
  args?: Record<string, unknown>,
) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code, args) });

export const conflictError = (code: CouponErrorCode) =>
  new ConflictException({ error: 'Conflict', ...errorBody(code) });

export const forbiddenError = (code: CouponErrorCode) =>
  new ForbiddenException({ error: 'Forbidden', ...errorBody(code) });

export const notFoundError = (code: CouponErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
