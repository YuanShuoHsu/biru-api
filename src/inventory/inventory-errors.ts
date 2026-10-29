import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const inventoryErrorCodes = [
  'ingredientNotFound',
  'packageRequired',
  'packageUnitIncompatible',
  'recipeIngredientExists',
  'recipeIngredientNotFound',
  'recipeNotFound',
  'supplierNotFound',
] as const;

export type InventoryErrorCode = (typeof inventoryErrorCodes)[number];

const errorBody = (code: InventoryErrorCode) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.inventory.${code}`) ??
    code,
});

export const badRequestError = (code: InventoryErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const conflictError = (code: InventoryErrorCode) =>
  new ConflictException({ error: 'Conflict', ...errorBody(code) });

export const notFoundError = (code: InventoryErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
