import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const cashDeviceErrorCodes = [
  'cashDeviceCollectionEmpty',
  'cashDeviceInactive',
  'cashDeviceInUse',
  'cashDeviceNotFound',
  'cashDeviceRefillEmpty',
  'idempotencyConflict',
] as const;

type CashDeviceErrorCode = (typeof cashDeviceErrorCodes)[number];

const errorBody = (code: CashDeviceErrorCode) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.cashDevices.${code}`) ??
    code,
});

export const badRequestError = (code: CashDeviceErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const notFoundError = (code: CashDeviceErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });

export const conflictError = (code: CashDeviceErrorCode) =>
  new ConflictException({ error: 'Conflict', ...errorBody(code) });
