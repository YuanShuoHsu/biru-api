import { ConflictException, NotFoundException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const operatingCostErrorCodes = [
  'operatingCostExists',
  'operatingCostNotFound',
] as const;

type OperatingCostErrorCode = (typeof operatingCostErrorCodes)[number];

const errorBody = (code: OperatingCostErrorCode) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(
      `common.operatingCosts.${code}`,
    ) ?? code,
});

export const notFoundError = (code: OperatingCostErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });

export const conflictError = (code: OperatingCostErrorCode) =>
  new ConflictException({ error: 'Conflict', ...errorBody(code) });
