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
  inventoryErrorCodes,
  notFoundError,
} from './inventory-errors.js';

const inventoryMessagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      inventory: Record<string, unknown>;
    }
  ).inventory;

describe('inventoryErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = inventoryMessagesOf(language);

    for (const code of inventoryErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
  });
});

describe('inventory errors', () => {
  beforeEach(() => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string) => `translated:${key}`,
    } as unknown as I18nContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['recipeNotFound', notFoundError, NotFoundException, 'Not Found'],
    [
      'packageUnitIncompatible',
      badRequestError,
      BadRequestException,
      'Bad Request',
    ],
    ['recipeIngredientExists', conflictError, ConflictException, 'Conflict'],
  ] as const)(
    '%s 回應帶代碼與目前語系的訊息',
    (code, build, exception, error) => {
      const thrown = build(code);

      expect(thrown).toBeInstanceOf(exception);
      expect(thrown.getResponse()).toEqual({
        code,
        error,
        message: `translated:common.inventory.${code}`,
      });
    },
  );

  it('衝突錯誤帶上明細，並把參數交給翻譯', () => {
    const t = vi.fn((key: string) => `translated:${key}`);
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t,
    } as unknown as I18nContext);

    const thrown = conflictError(
      'recipeInUseAsSource',
      { ingredients: [{ id: 'sauce' }] },
      { names: '番茄醬' },
    );

    expect(thrown.getResponse()).toEqual({
      code: 'recipeInUseAsSource',
      error: 'Conflict',
      ingredients: [{ id: 'sauce' }],
      message: 'translated:common.inventory.recipeInUseAsSource',
    });
    expect(t).toHaveBeenCalledWith('common.inventory.recipeInUseAsSource', {
      args: { names: '番茄醬' },
    });
  });
});
