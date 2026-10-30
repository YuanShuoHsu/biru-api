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
    ['packageRequired', badRequestError, BadRequestException, 'Bad Request'],
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
});
