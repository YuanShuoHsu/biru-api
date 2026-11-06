import { BadRequestException, NotFoundException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const storeLayoutErrorCodes = [
  'duplicateTableNumber',
  'notFound',
] as const;

export type StoreLayoutErrorCode = (typeof storeLayoutErrorCodes)[number];

const errorBody = (
  code: StoreLayoutErrorCode,
  args?: Record<string, unknown>,
) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.storeLayout.${code}`, {
      args,
    }) ?? code,
});

export const badRequestError = (
  code: StoreLayoutErrorCode,
  args?: Record<string, unknown>,
) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code, args) });

export const notFoundError = (code: StoreLayoutErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
