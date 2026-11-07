import { type ArgumentsHost, ForbiddenException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../../generated/i18n.generated.js';

export const accessForbiddenError = (host?: ArgumentsHost) =>
  new ForbiddenException({
    error: 'Forbidden',
    code: 'forbidden',
    message:
      I18nContext.current<I18nTranslations>(host)?.t(
        'common.exceptions.forbidden',
      ) ?? 'Forbidden',
  });
