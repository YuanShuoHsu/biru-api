import { readFileSync } from 'node:fs';

import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import {
  badRequestError,
  conflictError,
  internalServerError,
  invoiceErrorCodes,
  invoiceStatusText,
  notFoundError,
} from './invoice-errors.js';

const messagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      invoices: Record<string, unknown>;
    }
  ).invoices;

describe('invoiceErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = messagesOf(language);

    for (const code of invoiceErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
  });
});

describe('invoice error helpers', () => {
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
    ['customerNameRequiresIdentifier', badRequestError, BadRequestException],
    ['alreadyIssuing', conflictError, ConflictException],
    ['invoiceNotFound', notFoundError, NotFoundException],
  ] as const)('%s: 狀態碼不變且帶代碼', (code, create, type) => {
    const error = create(code);

    expect(error).toBeInstanceOf(type);
    expect(error.getResponse()).toMatchObject({
      code,
      message: `common.invoices.${code}`,
    });
  });

  it('帶參數的訊息保留參數', () => {
    expect(
      conflictError('notVoidable', {
        status: invoiceStatusText('voided'),
      }).getResponse(),
    ).toEqual({
      code: 'notVoidable',
      error: 'Conflict',
      message:
        'common.invoices.notVoidable:{"status":"common.invoices.status.voided"}',
    });
  });

  it('作廢未寫入本機時回 500 並帶代碼與發票號碼', () => {
    const error = internalServerError('voidWriteFailed', {
      invoiceNumber: 'AB12345678',
    });

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(error.getResponse()).toEqual({
      code: 'voidWriteFailed',
      error: 'Internal Server Error',
      message: 'common.invoices.voidWriteFailed:{"invoiceNumber":"AB12345678"}',
    });
  });

  it('沒有請求語系時以代碼當訊息、以狀態值當狀態文字', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue(undefined);

    expect(notFoundError('invoiceNotFound').getResponse()).toMatchObject({
      code: 'invoiceNotFound',
      message: 'invoiceNotFound',
    });
    expect(invoiceStatusText('issuing')).toBe('issuing');
  });
});
