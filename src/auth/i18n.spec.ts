import { TWO_FACTOR_ERROR_CODES } from 'better-auth/plugins';
import { readFileSync } from 'node:fs';

import { languagesEnum } from '../db/schema/enums.js';

const translations = Object.fromEntries(
  languagesEnum.enumValues.map((lang) => [
    lang,
    JSON.parse(readFileSync(`src/i18n/${lang}/auth.json`, 'utf8')) as Record<
      string,
      string
    >,
  ]),
);

describe('better-auth 錯誤翻譯', () => {
  it.each(languagesEnum.enumValues)('%s 翻譯了每個兩步驟驗證錯誤碼', (lang) => {
    expect(
      Object.keys(TWO_FACTOR_ERROR_CODES).filter(
        (code) => !translations[lang][code],
      ),
    ).toEqual([]);
  });
});
