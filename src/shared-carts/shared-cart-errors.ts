import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const sharedCartErrorCodes = [
  'sharedCartFull',
  'sharedCartMemberAvatarSignInRequired',
  'sharedCartNotFound',
] as const;

type SharedCartErrorCode = (typeof sharedCartErrorCodes)[number];

const errorBody = (code: SharedCartErrorCode) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.sharedCarts.${code}`) ??
    code,
});

export const badRequestError = (code: SharedCartErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const conflictError = (code: SharedCartErrorCode) =>
  new ConflictException({ error: 'Conflict', ...errorBody(code) });

export const notFoundError = (code: SharedCartErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
