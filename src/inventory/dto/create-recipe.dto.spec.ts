import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateRecipeDto,
  CreateRecipeIngredientDto,
  UpdateRecipeDto,
} from './create-recipe.dto.js';

const errorsOf = async (requiredQuantity: string) =>
  (
    await validate(
      plainToInstance(CreateRecipeIngredientDto, {
        ingredientId: 'milk',
        requiredQuantity,
      }),
    )
  ).map(({ property }) => property);

describe('CreateRecipeIngredientDto', () => {
  it.each(['0', '4', '4.000', '999999999.999'])(
    'accepts requiredQuantity %s',
    async (requiredQuantity) => {
      expect(await errorsOf(requiredQuantity)).toEqual([]);
    },
  );

  it.each(['-1', '1000000000', '1.2345', '+1'])(
    'rejects requiredQuantity %s',
    async (requiredQuantity) => {
      expect(await errorsOf(requiredQuantity)).toEqual(['requiredQuantity']);
    },
  );
});

describe('CreateRecipeDto recipeYieldQuantity', () => {
  const yieldErrorsOf = async (
    dto: typeof CreateRecipeDto | typeof UpdateRecipeDto,
    fields: object,
  ) =>
    (
      await validate(
        plainToInstance(dto, { name: { 'zh-TW': '番茄醬' }, ...fields }),
      )
    ).map(({ property }) => property);

  it.each([
    {},
    { recipeYieldQuantity: '0', recipeYieldUnitCode: 'GRM' },
    { recipeYieldQuantity: '1500.000', recipeYieldUnitCode: 'KGM' },
    { recipeYieldQuantity: null, recipeYieldUnitCode: null },
  ])('accepts %o', async (fields) => {
    expect(await yieldErrorsOf(CreateRecipeDto, fields)).toEqual([]);
    expect(await yieldErrorsOf(UpdateRecipeDto, fields)).toEqual([]);
  });

  it.each([
    [{ recipeYieldQuantity: '1' }, ['recipeYieldQuantity']],
    [{ recipeYieldUnitCode: 'GRM' }, ['recipeYieldUnitCode']],
    [
      { recipeYieldQuantity: '1', recipeYieldUnitCode: null },
      ['recipeYieldQuantity'],
    ],
    [
      { recipeYieldQuantity: '-1', recipeYieldUnitCode: 'GRM' },
      ['recipeYieldQuantity'],
    ],
    [
      { recipeYieldQuantity: '1', recipeYieldUnitCode: 'TNE' },
      ['recipeYieldUnitCode'],
    ],
  ])('rejects %o', async (fields, properties) => {
    expect(await yieldErrorsOf(CreateRecipeDto, fields)).toEqual(properties);
    expect(await yieldErrorsOf(UpdateRecipeDto, fields)).toEqual(properties);
  });
});
