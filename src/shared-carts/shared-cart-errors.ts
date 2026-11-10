import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { OrderMode } from '../db/schema/orders.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

export const sharedCartErrorCodes = [
  'sharedCartFull',
  'sharedCartMemberAvatarSignInRequired',
  'sharedCartModeMismatch',
  'sharedCartNotFound',
  'sharedCartPending',
  'sharedCartRequestNotFound',
  'sharedCartRequestsFull',
] as const;

type SharedCartErrorCode = (typeof sharedCartErrorCodes)[number];

const translate = () => I18nContext.current<I18nTranslations>();

const errorBody = (
  code: SharedCartErrorCode,
  args?: Record<string, unknown>,
) => ({
  code,
  message: translate()?.t(`common.sharedCarts.${code}`, { args }) ?? code,
});

export const badRequestError = (code: SharedCartErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const conflictError = (code: SharedCartErrorCode) =>
  new ConflictException({ error: 'Conflict', ...errorBody(code) });

export const modeMismatchError = (mode: OrderMode) =>
  new ConflictException({
    error: 'Conflict',
    ...errorBody('sharedCartModeMismatch', {
      mode: translate()?.t(`common.orderTickets.modes.${mode}`) ?? mode,
    }),
    mode,
  });

export const forbiddenError = (code: SharedCartErrorCode) =>
  new ForbiddenException({ error: 'Forbidden', ...errorBody(code) });

export const isSharedCartNotFound = (error: unknown) =>
  error instanceof NotFoundException &&
  (error.getResponse() as { code?: unknown }).code === 'sharedCartNotFound';

export const notFoundError = (code: SharedCartErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
