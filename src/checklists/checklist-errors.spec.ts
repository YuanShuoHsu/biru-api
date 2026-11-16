import { readFileSync } from 'node:fs';

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import {
  badRequestError,
  checklistErrorCodes,
  notFoundError,
} from './checklist-errors.js';

const checklistMessagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      checklists: Record<string, unknown>;
    }
  ).checklists;

describe('checklistErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = checklistMessagesOf(language);

    for (const code of checklistErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
  });
});

describe('checklist errors', () => {
  beforeEach(() => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string) => `translated:${key}`,
    } as unknown as I18nContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      'checklistTemplateNotFound',
      notFoundError,
      NotFoundException,
      'Not Found',
    ],
    [
      'checklistItemInvalidRange',
      badRequestError,
      BadRequestException,
      'Bad Request',
    ],
  ] as const)(
    '%s 回應帶代碼與目前語系的訊息',
    (code, build, exception, error) => {
      const thrown = build(code);

      expect(thrown).toBeInstanceOf(exception);
      expect(thrown.getResponse()).toEqual({
        code,
        error,
        message: `translated:common.checklists.${code}`,
      });
    },
  );
});
