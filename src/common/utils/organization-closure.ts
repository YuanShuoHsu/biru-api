import {
  type ArgumentsHost,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../../generated/i18n.generated.js';

export const organizationClosedError = () =>
  new ConflictException(
    I18nContext.current<I18nTranslations>()?.t(
      'common.exceptions.organizationClosed',
    ) ?? 'This store is closed.',
  );

export const organizationReadOnlyError = (host: ArgumentsHost) =>
  new ForbiddenException(
    I18nContext.current<I18nTranslations>(host)?.t(
      'common.exceptions.organizationReadOnly',
    ) ?? 'This store is closed. Its data is read-only.',
  );

export const organizationHasOpenWorkError = (orders: number, tickets: number) =>
  new ConflictException(
    I18nContext.current<I18nTranslations>()?.t(
      'common.exceptions.organizationHasOpenWork',
      { args: { orders, tickets } },
    ) ?? 'Complete or cancel open orders and waitlist tickets first.',
  );
