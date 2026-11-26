import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const catalogErrorCodes = [
  'catalogItemListed',
  'catalogItemNotFound',
  'catalogItemSectionOwnerMismatch',
  'catalogSectionHasItems',
  'catalogSectionHasSubsections',
  'catalogSectionInUse',
  'catalogSectionNotFound',
  'fixedSweetnessLevelRequired',
  'parentCatalogSectionDescendant',
  'parentCatalogSectionNotFound',
  'parentCatalogSectionOwnerMismatch',
  'parentCatalogSectionSelf',
  'promoDateRangeInvalid',
] as const;

export type CatalogErrorCode = (typeof catalogErrorCodes)[number];

const errorBody = (code: CatalogErrorCode, args?: Record<string, unknown>) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.catalog.${code}`, {
      args,
    }) ?? code,
});

export const badRequestError = (code: CatalogErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const conflictError = (
  code: CatalogErrorCode,
  details?: Record<string, unknown>,
  args?: Record<string, unknown>,
) =>
  new ConflictException({
    error: 'Conflict',
    ...details,
    ...errorBody(code, args),
  });

export const notFoundError = (code: CatalogErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
