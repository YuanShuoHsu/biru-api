import { readFileSync } from 'node:fs';

import { NotFoundException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import { couponErrorCodes, notFoundError } from './coupon-errors.js';

const messagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      coupons: Record<string, unknown>;
    }
  ).coupons;

describe('couponErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = messagesOf(language);

    for (const code of couponErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
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

    const error = notFoundError('couponNotFound');

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toEqual({
      code: 'couponNotFound',
      error: 'Not Found',
      message: 'translated:common.coupons.couponNotFound',
    });
  });

  it('沒有請求語系時以代碼當訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue(undefined);

    expect(notFoundError('couponNotFound').getResponse()).toMatchObject({
      code: 'couponNotFound',
      message: 'couponNotFound',
    });
  });
});
