import { i18n } from '@better-auth/i18n';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, isAPIError } from 'better-auth/api';
import type { I18nService } from 'nestjs-i18n';

import { toLanguage } from '../common/utils/language.js';
import { DEFAULT_LANGUAGE, languagesEnum } from '../db/schema/enums.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

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
    getLocale: ({ headers }) => toLanguage(headers?.get('accept-language')),
  });

  return {
    plugin,
    localizeError: (error: unknown, headers?: Headers) => {
      if (!isAPIError(error)) return error;

      const code = error.body?.code;
      const message =
        code && translations[toLanguage(headers?.get('accept-language'))][code];

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
