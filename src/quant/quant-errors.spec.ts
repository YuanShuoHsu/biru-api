import { readFileSync } from 'node:fs';

import { BadRequestException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import { badRequestError, quantErrorCodes } from './quant-errors.js';

const messagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      quant: Record<string, unknown>;
    }
  ).quant;

describe('quantErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = messagesOf(language);

    for (const code of quantErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
  });
});

describe('badRequestError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('回應帶代碼與帶參數翻譯的訊息', () => {
    const t = vi.fn((key: string) => `translated:${key}`);
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t,
    } as unknown as I18nContext);
    const args = { message: 'Insufficient balance' };

    const error = badRequestError('exchangeRejected', args);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      code: 'exchangeRejected',
      error: 'Bad Request',
      message: 'translated:common.quant.exchangeRejected',
    });
    expect(t).toHaveBeenCalledWith('common.quant.exchangeRejected', { args });
  });

  it('沒有請求語系時以代碼當訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue(undefined);

    expect(badRequestError('botNotFound').getResponse()).toMatchObject({
      code: 'botNotFound',
      message: 'botNotFound',
    });
  });
});
