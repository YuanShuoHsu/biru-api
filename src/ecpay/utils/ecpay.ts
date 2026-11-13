import * as crypto from 'crypto';

import { SERVING_TEMPERATURE_LEVEL_NAMES } from '../../common/constants/serving-temperature.js';
import { SWEETNESS_LEVEL_NAMES } from '../../common/constants/sweetness.js';
import {
  STORE_UTC_OFFSET,
  toPlatformTime,
} from '../../common/constants/timezone.js';
import { sumOrderItems } from '../../common/utils/order-items.js';
import type { OrderResponseDto } from '../../orders/dto/order-response.dto.js';

export class EcpayRejectedError extends Error {
  name = 'EcpayRejectedError';
}

export const encryptData = (
  plaintext: string,
  hashKey: string,
  hashIV: string,
): string => {
  const cipher = crypto.createCipheriv(
    'aes-128-cbc',
    Buffer.from(hashKey, 'utf8'),
    Buffer.from(hashIV, 'utf8'),
  );

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  return encrypted;
};

export const decodeUrlEncoded = (value: string): string =>
  decodeURIComponent(value.replace(/\+/g, '%20'));

export const decryptData = (
  base64Data: string,
  hashKey: string,
  hashIV: string,
): string => {
  const decipher = crypto.createDecipheriv(
    'aes-128-cbc',
    Buffer.from(hashKey, 'utf8'),
    Buffer.from(hashIV, 'utf8'),
  );

  let decrypted = decipher.update(base64Data, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

export const ITEM_WORD = '份';

export const toInvoiceDateText = (value: Date): string =>
  toPlatformTime(value).toISOString().slice(0, 10);

export const fromEcpayDateTime = (value: string): Date =>
  new Date(`${value.replace(/\//g, '-').replace(' ', 'T')}${STORE_UTC_OFFSET}`);

export const toGetIssueQuery = (data: {
  invoiceDate: Date | null;
  invoiceNumber: string | null;
  relateNumber: string | null;
}):
  | { InvoiceDate: string; InvoiceNo: string }
  | { RelateNumber: string }
  | null => {
  if (data.relateNumber) return { RelateNumber: data.relateNumber };
  if (!data.invoiceNumber || !data.invoiceDate) return null;

  return {
    InvoiceDate: toInvoiceDateText(data.invoiceDate),
    InvoiceNo: data.invoiceNumber,
  };
};

export const QUERY_INTERVAL_MS = 300;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const ITEM_NAME_MAX_LENGTH = 400;
const TRADE_DESC_MAX_LENGTH = 200;

export const truncate = (value: string, maxLength: number): string =>
  [...value].slice(0, maxLength).join('');

const sanitize = (value: string): string =>
  // eslint-disable-next-line no-control-regex
  value.replace(/[#\u0000-\u001F]/g, ' ').trim();

const truncateItemName = (value: string): string => {
  const truncated = truncate(value, ITEM_NAME_MAX_LENGTH);
  if (truncated === value) return truncated;

  const lastSeparator = truncated.lastIndexOf('#');

  return lastSeparator > 0 ? truncated.slice(0, lastSeparator) : truncated;
};

const buildItemName = (items: OrderResponseDto['items']): string =>
  items
    .map(
      ({
        addOns,
        menuItemName,
        modifiers,
        orderQuantity,
        servingTemperatureLevel,
        sweetnessLevel,
      }) => {
        const choices = [
          ...(servingTemperatureLevel
            ? [SERVING_TEMPERATURE_LEVEL_NAMES[servingTemperatureLevel]]
            : []),
          ...(sweetnessLevel ? [SWEETNESS_LEVEL_NAMES[sweetnessLevel]] : []),
          ...(modifiers ?? []).map(({ modifierName }) => modifierName),
          ...(addOns ?? []).map(({ menuItemName: name }) => name),
        ]
          .map(sanitize)
          .filter(Boolean);

        const suffix = choices.length ? `(${choices.join('/')})` : '';

        return `${sanitize(menuItemName)}${suffix} x${orderQuantity}`;
      },
    )
    .join('#');

export const toEcpayTradeFields = (
  order: Pick<OrderResponseDto, 'discount' | 'items'>,
  tradeDesc: string,
) => ({
  ItemName: truncateItemName(buildItemName(order.items)),
  TotalAmount:
    Math.round(sumOrderItems(order.items)) -
    Math.round(Number(order.discount || 0)),
  TradeDesc: truncate(sanitize(tradeDesc), TRADE_DESC_MAX_LENGTH),
});

export const toEcpayTradeDate = (): string => {
  const taipei = new Date(Date.now() + 8 * 60 * 60 * 1000);

  return taipei.toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, '/');
};
