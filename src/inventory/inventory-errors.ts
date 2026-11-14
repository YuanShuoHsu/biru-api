import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

export const inventoryErrorCodes = [
  'ingredientInUse',
  'ingredientNotFound',
  'insufficientStock',
  'modifierRecipeYieldNotOne',
  'packageRequired',
  'packageUnitIncompatible',
  'purchaseFieldsOnSourcedIngredient',
  'recipeInUseAsSource',
  'recipeIngredientExists',
  'recipeIngredientNotFound',
  'recipeMenuItemAndModifier',
  'recipeMenuItemTaken',
  'recipeModifierTaken',
  'recipeNotFound',
  'sourceRecipeHasMenuItem',
  'sourceRecipeHasModifier',
  'sourceRecipeNested',
  'sourceRecipeRequired',
  'sourceRecipeUnitIncompatible',
  'sourceRecipeYieldMissing',
  'supplierNotFound',
  'wasteExceedsStock',
  'wasteRecipeMissing',
] as const;

type InventoryErrorCode = (typeof inventoryErrorCodes)[number];

const errorBody = (
  code: InventoryErrorCode,
  args?: Record<string, unknown>,
) => ({
  code,
  message:
    I18nContext.current<I18nTranslations>()?.t(`common.inventory.${code}`, {
      args,
    }) ?? code,
});

export const badRequestError = (
  code: InventoryErrorCode,
  details?: Record<string, unknown>,
) =>
  new BadRequestException({
    error: 'Bad Request',
    ...details,
    ...errorBody(code),
  });

export const conflictError = (
  code: InventoryErrorCode,
  details?: Record<string, unknown>,
  args?: Record<string, unknown>,
) =>
  new ConflictException({
    error: 'Conflict',
    ...details,
    ...errorBody(code, args),
  });

export const notFoundError = (code: InventoryErrorCode) =>
  new NotFoundException({ error: 'Not Found', ...errorBody(code) });
