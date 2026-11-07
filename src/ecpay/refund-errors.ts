import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const refundErrorCodes = [
  'alreadyRefunded',
  'cardRefundUnavailable',
  'invalidAmount',
  'itemNotInOrder',
  'noEcpayTransaction',
  'notPaid',
  'notRefundable',
  'nothingToRefund',
  'quantityExceeded',
  'resultUnknown',
] as const;

export type RefundErrorCode = (typeof refundErrorCodes)[number];

const errorBody = (code: RefundErrorCode, args?: Record<string, unknown>) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.refunds.${code}`, {
      args,
    }) ?? code,
});

export const badRequestError = (
  code: RefundErrorCode,
  args?: Record<string, unknown>,
) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code, args) });

export const conflictError = (code: RefundErrorCode) =>
  new ConflictException({ error: 'Conflict', ...errorBody(code) });

export const serviceUnavailableError = (code: RefundErrorCode) =>
  new ServiceUnavailableException({
    error: 'Service Unavailable',
    ...errorBody(code),
  });
