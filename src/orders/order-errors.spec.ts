import { readFileSync } from 'node:fs';

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import {
  badRequestError,
  conflictError,
  notFoundError,
  orderErrorCodes,
  orderTicketErrorCodes,
} from './order-errors.js';

const messagesOf = (
  language: string,
  namespace: 'orders' | 'orderTickets',
): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      orders: Record<string, unknown>;
      orderTickets: Record<string, unknown>;
    }
  )[namespace];

describe('orderErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const orders = messagesOf(language, 'orders');
    const orderTickets = messagesOf(language, 'orderTickets');

    for (const code of orderErrorCodes)
      expect(orders[code], code).toEqual(expect.stringMatching(/\S/));
    for (const code of orderTicketErrorCodes)
      expect(orderTickets[code], code).toEqual(expect.stringMatching(/\S/));
  });
});

describe('order error helpers', () => {
  beforeEach(() => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string, options?: { args?: { name?: string } }) =>
        options?.args?.name ? `${key}:${options.args.name}` : key,
    } as unknown as I18nContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['pickupTooSoon', badRequestError, BadRequestException],
    ['paymentAttemptsExhausted', conflictError, ConflictException],
    ['menuChanged', notFoundError, NotFoundException],
  ] as const)('%s: 狀態碼不變且帶代碼', (code, create, type) => {
    const error = create(code);

    expect(error).toBeInstanceOf(type);
    expect(error.getResponse()).toMatchObject({
      code,
      message: `common.orders.${code}`,
    });
  });

  it('帶參數的訊息保留參數', () => {
    expect(
      badRequestError('menuItemUnavailable', { name: '拿鐵' }).getResponse(),
    ).toEqual({
      code: 'menuItemUnavailable',
      error: 'Bad Request',
      message: 'common.orders.menuItemUnavailable:拿鐵',
    });
  });

  it('工作單錯誤從工作單的翻譯取訊息', () => {
    const error = conflictError('printJobResolved');

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toEqual({
      code: 'printJobResolved',
      error: 'Conflict',
      message: 'common.orderTickets.printJobResolved',
    });
  });
});

describe('notFoundError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('回應帶代碼與目前語系的訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string) => `translated:${key}`,
    } as unknown as I18nContext);

    const error = notFoundError('orderNotFound');

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toEqual({
      code: 'orderNotFound',
      error: 'Not Found',
      message: 'translated:common.orders.orderNotFound',
    });
  });

  it('沒有請求語系時以代碼當訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue(undefined);

    expect(notFoundError('orderNotFound').getResponse()).toMatchObject({
      code: 'orderNotFound',
      message: 'orderNotFound',
    });
  });
});
