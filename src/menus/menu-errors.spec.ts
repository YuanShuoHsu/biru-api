import { readFileSync } from 'node:fs';

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import {
  badRequestError,
  menuErrorCodes,
  notFoundError,
} from './menu-errors.js';

const menusMessagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      menus: Record<string, unknown>;
    }
  ).menus;

describe('menuErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = menusMessagesOf(language);

    for (const code of menuErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
  });
});

describe('menu errors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('回應帶代碼與目前語系的訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string) => `translated:${key}`,
    } as unknown as I18nContext);

    const error = notFoundError('offerNotFound');

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toEqual({
      code: 'offerNotFound',
      error: 'Not Found',
      message: 'translated:common.menus.offerNotFound',
    });
  });

  it('沒有請求語系時以代碼當訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue(undefined);

    const error = badRequestError('fixedSweetnessLevelRequired');

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      code: 'fixedSweetnessLevelRequired',
      error: 'Bad Request',
      message: 'fixedSweetnessLevelRequired',
    });
  });
});
