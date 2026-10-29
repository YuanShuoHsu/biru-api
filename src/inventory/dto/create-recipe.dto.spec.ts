import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateRecipeDto, UpdateRecipeDto } from './create-recipe.dto.js';

const errorsOf = async (
  dto: typeof CreateRecipeDto | typeof UpdateRecipeDto,
  fields: object,
) =>
  (await validate(plainToInstance(dto, fields))).map(
    ({ property }) => property,
  );

const name = { 'zh-TW': '抹茶奶酪' };

describe('CreateRecipeDto recipeInstructions', () => {
  it('accepts localized steps', async () => {
    expect(
      await errorsOf(CreateRecipeDto, {
        name,
        recipeInstructions: [{ 'zh-TW': '吉利丁片泡冷水軟化' }],
      }),
    ).toEqual([]);
  });

  it.each([[['泡軟']], [[1]], [[null]], [[['泡軟']]]])(
    'rejects steps that are not localized text: %j',
    async (recipeInstructions) => {
      expect(
        await errorsOf(CreateRecipeDto, { name, recipeInstructions }),
      ).toEqual(['recipeInstructions']);
      expect(await errorsOf(UpdateRecipeDto, { recipeInstructions })).toEqual([
        'recipeInstructions',
      ]);
    },
  );
});
