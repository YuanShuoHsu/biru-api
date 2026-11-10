import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const sharedCartErrorCodes = [
  'sharedCartCodeNotFound',
  'sharedCartFull',
  'sharedCartItemNotFound',
  'sharedCartItemsFull',
  'sharedCartLimitReached',
  'sharedCartMemberAvatarSignInRequired',
  'sharedCartNotFound',
  'sharedCartParticipantNotFound',
  'sharedCartPending',
  'sharedCartRemoveSelf',
  'sharedCartRequestNotFound',
  'sharedCartRequestsFull',
] as const;

type SharedCartErrorCode = (typeof sharedCartErrorCodes)[number];

const errorBody = (
  code: SharedCartErrorCode,
  args?: Record<string, unknown>,
) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.sharedCarts.${code}`, {
      args,
    }) ?? code,
});

export const badRequestError = (code: SharedCartErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const conflictError = (
  code: SharedCartErrorCode,
  args?: Record<string, unknown>,
) => new ConflictException({ error: 'Conflict', ...errorBody(code, args) });

export const forbiddenError = (code: SharedCartErrorCode) =>
  new ForbiddenException({ error: 'Forbidden', ...errorBody(code) });

export const isSharedCartNotFound = (error: unknown) =>
  error instanceof NotFoundException &&
  (error.getResponse() as { code?: unknown }).code === 'sharedCartNotFound';

export const notFoundError = (code: SharedCartErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
