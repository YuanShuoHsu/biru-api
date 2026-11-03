import { BadRequestException, NotFoundException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const orderErrorCodes = [
  'cashUnavailableForMode',
  'onlinePaymentNotRequired',
  'orderNotFound',
  'orderQrSecretNeverRotated',
  'orderQrSessionNotFound',
  'pickupTimeUnavailableForMode',
  'tableNumberOutOfRange',
] as const;

export type OrderErrorCode = (typeof orderErrorCodes)[number];

const errorBody = (code: OrderErrorCode) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.orders.${code}`) ?? code,
});

export const badRequestError = (code: OrderErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const notFoundError = (code: OrderErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
