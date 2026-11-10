import { readFileSync } from 'node:fs';

import { BadRequestException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import { bannerErrorCodes, badRequestError } from './banner-errors.js';

const messagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      banners: Record<string, unknown>;
    }
  ).banners;

describe('bannerErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = messagesOf(language);

    for (const code of bannerErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
  });
});

describe('badRequestError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('回應帶代碼與目前語系的訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string) => `translated:${key}`,
    } as unknown as I18nContext);

    const error = badRequestError('scheduleInvalid');

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      code: 'scheduleInvalid',
      error: 'Bad Request',
      message: 'translated:common.banners.scheduleInvalid',
    });
  });

  it('沒有請求語系時以代碼當訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue(undefined);

    expect(badRequestError('scheduleInvalid').getResponse()).toMatchObject({
      code: 'scheduleInvalid',
      message: 'scheduleInvalid',
    });
  });
});
