import { APIError, isAPIError } from 'better-auth/api';
import { TWO_FACTOR_ERROR_CODES } from 'better-auth/plugins';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { languagesEnum } from '../db/schema/enums.js';

import { createAuthI18n } from './i18n.js';

const translations = Object.fromEntries(
  languagesEnum.enumValues.map((lang) => [
    lang,
    JSON.parse(
      readFileSync(
        join(import.meta.dirname, `../i18n/${lang}/auth.json`),
        'utf8',
      ),
    ) as Record<string, string>,
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

  it('兩步驟驗證錯誤依 Accept-Language 翻成對應語系', () => {
    const { localizeError } = createAuthI18n({
      t: (_: string, { lang }: { lang: string }) => translations[lang],
    } as never);

    const error = localizeError(
      APIError.from('UNAUTHORIZED', TWO_FACTOR_ERROR_CODES.INVALID_CODE),
      new Headers({ 'accept-language': 'ja' }),
    );

    expect(isAPIError(error) && error.message).toBe(
      translations.ja.INVALID_CODE,
    );
  });
});
