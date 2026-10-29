import { NotFoundException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const inventoryErrorCodes = [
  'ingredientNotFound',
  'menuItemNotFound',
  'recipeIngredientNotFound',
  'recipeNotFound',
  'supplierNotFound',
] as const;

export type InventoryErrorCode = (typeof inventoryErrorCodes)[number];

export const notFoundError = (code: InventoryErrorCode) =>
  new NotFoundException({
    error: 'Not Found',
    code,
    message:
      I18nContext.current<I18nTranslations>()?.t(`common.inventory.${code}`) ??
      code,
  });
