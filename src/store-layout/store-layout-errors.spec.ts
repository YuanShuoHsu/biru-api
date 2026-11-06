import { readFileSync } from 'node:fs';

import { BadRequestException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import {
  badRequestError,
  storeLayoutErrorCodes,
} from './store-layout-errors.js';

const messagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      storeLayout: Record<string, unknown>;
    }
  ).storeLayout;

describe('storeLayoutErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = messagesOf(language);

    for (const code of storeLayoutErrorCodes)
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

    const error = badRequestError('duplicateTableNumber', { tableNumber: 5 });

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      code: 'duplicateTableNumber',
      error: 'Bad Request',
      message: 'translated:common.storeLayout.duplicateTableNumber',
    });
    expect(t).toHaveBeenCalledWith('common.storeLayout.duplicateTableNumber', {
      args: { tableNumber: 5 },
    });
  });
});
