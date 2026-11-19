import { ConflictException, NotFoundException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const cashDeviceErrorCodes = [
  'cashDeviceInUse',
  'cashDeviceNotFound',
] as const;

type CashDeviceErrorCode = (typeof cashDeviceErrorCodes)[number];

const errorBody = (code: CashDeviceErrorCode) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.cashDevices.${code}`) ??
    code,
});

export const notFoundError = (code: CashDeviceErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });

export const conflictError = (code: CashDeviceErrorCode) =>
  new ConflictException({ error: 'Conflict', ...errorBody(code) });
