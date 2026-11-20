import { readFileSync } from 'node:fs';

import { ConflictException, NotFoundException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import {
  operatingCostErrorCodes,
  conflictError,
  notFoundError,
} from './operating-cost-errors.js';

const operatingCostMessagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      operatingCosts: Record<string, unknown>;
    }
  ).operatingCosts;

describe('operatingCostErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = operatingCostMessagesOf(language);

    for (const code of operatingCostErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
  });
});

describe('operating cost errors', () => {
  beforeEach(() => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string) => `translated:${key}`,
    } as unknown as I18nContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['operatingCostNotFound', notFoundError, NotFoundException, 'Not Found'],
    ['operatingCostExists', conflictError, ConflictException, 'Conflict'],
  ] as const)(
    '%s 回應帶代碼與目前語系的訊息',
    (code, build, exception, error) => {
      const thrown = build(code);

      expect(thrown).toBeInstanceOf(exception);
      expect(thrown.getResponse()).toEqual({
        code,
        error,
        message: `translated:common.operatingCosts.${code}`,
      });
    },
  );
});
