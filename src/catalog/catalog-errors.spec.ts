import { readFileSync } from 'node:fs';

import { languagesEnum } from '../db/schema/enums.js';

import { catalogErrorCodes } from './catalog-errors.js';

const messagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      catalog: Record<string, unknown>;
    }
  ).catalog;

describe('catalogErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = messagesOf(language);

    for (const code of catalogErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
  });
});
