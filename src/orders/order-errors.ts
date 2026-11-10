import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const orderErrorCodes = [
  'cashUnavailableForMode',
  'idempotencyConflict',
  'inStoreQrCodeRequired',
  'invalidTable',
  'menuChanged',
  'menuItemInsufficientStock',
  'menuItemOptionsInvalid',
  'menuItemUnavailable',
  'menuItemUnavailableAtTime',
  'menuItemUnavailableForMode',
  'modifierInsufficientStock',
  'modifierUnavailable',
  'modifierUnavailableForMode',
  'notAwaitingPayment',
  'onlinePaymentNotRequired',
  'orderNotFound',
  'orderQrSecretNeverRotated',
  'orderQrSessionNotFound',
  'orderTotalTooLarge',
  'paymentAttemptsExhausted',
  'pickupOutsideOpeningHours',
  'pickupTimeInvalid',
  'pickupTimeUnavailableForMode',
  'pickupTooCloseToClosing',
  'pickupTooFarAhead',
  'pickupTooSoon',
  'statusChanged',
  'tableNumberOutOfRange',
] as const;

export const orderTicketErrorCodes = [
  'noPrinter',
  'notReprintable',
  'printJobResolved',
  'printerBusy',
  'printerNameTaken',
] as const;

type OrderTicketErrorCode = (typeof orderTicketErrorCodes)[number];

type OrderErrorCode = (typeof orderErrorCodes)[number] | OrderTicketErrorCode;

const isTicketCode = (code: OrderErrorCode): code is OrderTicketErrorCode =>
  orderTicketErrorCodes.some((ticketCode) => ticketCode === code);

const errorBody = (code: OrderErrorCode, args?: Record<string, unknown>) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(
      isTicketCode(code)
        ? `common.orderTickets.${code}`
        : `common.orders.${code}`,
      { args },
    ) ?? code,
});

export const badRequestError = (
  code: OrderErrorCode,
  args?: Record<string, unknown>,
) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code, args) });

export const conflictError = (code: OrderErrorCode) =>
  new ConflictException({ error: 'Conflict', ...errorBody(code) });

export const notFoundError = (code: OrderErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
