import { i18n } from '@better-auth/i18n';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, isAPIError } from 'better-auth/api';
import type { I18nService } from 'nestjs-i18n';

import {
  DEFAULT_LANGUAGE,
  type Language,
  languagesEnum,
} from '../db/schema/enums';
import type { I18nTranslations } from '../generated/i18n.generated';

const toLanguage = (headers?: Headers | null): Language =>
  languagesEnum.enumValues.find(
    (value) => value === headers?.get('accept-language'),
  ) ?? DEFAULT_LANGUAGE;

export const createAuthI18n = (i18nService: I18nService<I18nTranslations>) => {
  const translations: Record<
    string,
    Record<string, string>
  > = Object.fromEntries(
    languagesEnum.enumValues.map((lang) => [
      lang,
      i18nService.t('auth', { lang }),
    ]),
  );

  const plugin: BetterAuthPlugin = i18n({
    translations,
    defaultLocale: DEFAULT_LANGUAGE,
    detection: ['callback'],
    getLocale: ({ headers }) => toLanguage(headers),
  });

  return {
    plugin,
    // before hook 丟出的錯誤不會經過 after hook，官方 i18n 外掛翻不到
    localizeError: (error: unknown, headers?: Headers) => {
      if (!isAPIError(error)) return error;

      const code = error.body?.code;
      const message = code && translations[toLanguage(headers)][code];

      return message
        ? new APIError(error.status, {
            ...error.body,
            message,
            originalMessage: error.message,
          })
        : error;
    },
  };
};

export type LocalizeAuthError = ReturnType<
  typeof createAuthI18n
>['localizeError'];
