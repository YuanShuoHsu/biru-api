import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const catalogErrorCodes = [
  'catalogSectionHasItems',
  'catalogSectionHasSubsections',
  'catalogSectionInUse',
  'catalogSectionNotFound',
  'parentCatalogSectionDescendant',
  'parentCatalogSectionNotFound',
  'parentCatalogSectionOwnerMismatch',
  'parentCatalogSectionSelf',
] as const;

export type CatalogErrorCode = (typeof catalogErrorCodes)[number];

const errorBody = (code: CatalogErrorCode) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.catalog.${code}`) ??
    code,
});

export const badRequestError = (code: CatalogErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const conflictError = (code: CatalogErrorCode) =>
  new ConflictException({ error: 'Conflict', ...errorBody(code) });

export const notFoundError = (code: CatalogErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
