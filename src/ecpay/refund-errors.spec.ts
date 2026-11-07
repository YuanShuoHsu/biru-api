import { readFileSync } from 'node:fs';

import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import {
  badRequestError,
  conflictError,
  refundErrorCodes,
  serviceUnavailableError,
} from './refund-errors.js';

const messagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      refunds: Record<string, unknown>;
    }
  ).refunds;

describe('refundErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = messagesOf(language);

    for (const code of refundErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
  });
});

describe('refund error helpers', () => {
  beforeEach(() => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string, options?: { args?: Record<string, unknown> }) =>
        options?.args ? `${key}:${JSON.stringify(options.args)}` : key,
    } as unknown as I18nContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['nothingToRefund', badRequestError, BadRequestException],
    ['alreadyRefunded', conflictError, ConflictException],
    ['resultUnknown', serviceUnavailableError, ServiceUnavailableException],
  ] as const)('%s: 狀態碼不變且帶代碼', (code, create, type) => {
    const error = create(code);

    expect(error).toBeInstanceOf(type);
    expect(error.getResponse()).toMatchObject({
      code,
      message: `common.refunds.${code}`,
    });
  });

  it('帶參數的訊息保留參數', () => {
    expect(
      badRequestError('quantityExceeded', {
        name: '拿鐵',
        remaining: 1,
      }).getResponse(),
    ).toEqual({
      code: 'quantityExceeded',
      error: 'Bad Request',
      message: 'common.refunds.quantityExceeded:{"name":"拿鐵","remaining":1}',
    });
  });

  it('沒有請求語系時以代碼當訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue(undefined);

    expect(
      serviceUnavailableError('cardRefundUnavailable').getResponse(),
    ).toEqual({
      code: 'cardRefundUnavailable',
      error: 'Service Unavailable',
      message: 'cardRefundUnavailable',
    });
  });
});
