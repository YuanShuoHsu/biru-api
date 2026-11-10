import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { InvoiceStatus } from '../db/schema/invoices.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

export const invoiceErrorCodes = [
  'allowanceIssued',
  'alreadyIssuing',
  'customerNameRequiresIdentifier',
  'invoiceNotFound',
  'notIssued',
  'notPaid',
  'notPending',
  'notPrintable',
  'notVoidable',
  'orderRefunded',
  'pastVoidablePeriod',
  'printJobNotQueued',
  'printJobResolved',
  'printing',
  'voidWriteFailed',
] as const;

export type InvoiceErrorCode = (typeof invoiceErrorCodes)[number];

const errorBody = (code: InvoiceErrorCode, args?: Record<string, unknown>) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.invoices.${code}`, {
      args,
    }) ?? code,
});

export const invoiceStatusText = (status: InvoiceStatus) =>
  I18nContext.current<I18nTranslations>()?.t(
    `common.invoices.status.${status}`,
  ) ?? status;

export const badRequestError = (code: InvoiceErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const conflictError = (
  code: InvoiceErrorCode,
  args?: Record<string, unknown>,
) => new ConflictException({ error: 'Conflict', ...errorBody(code, args) });

export const internalServerError = (
  code: InvoiceErrorCode,
  args?: Record<string, unknown>,
) =>
  new InternalServerErrorException({
    error: 'Internal Server Error',
    ...errorBody(code, args),
  });

export const notFoundError = (code: InvoiceErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
