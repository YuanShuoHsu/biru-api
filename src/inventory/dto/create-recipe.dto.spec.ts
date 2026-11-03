import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateRecipeIngredientDto } from './create-recipe.dto.js';

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
