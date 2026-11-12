import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateIngredientWasteDto } from './create-ingredient-waste.dto.js';

const errorsOf = async (body: Record<string, unknown>) =>
  (
    await validate(
      plainToInstance(CreateIngredientWasteDto, {
        quantity: '1',
        wasteReason: 'expired',
        ...body,
      }),
    )
  ).map(({ property }) => property);

describe('CreateIngredientWasteDto', () => {
  it.each(['0.001', '250.000', '999999999.999'])(
    'accepts quantity %s',
    async (quantity) => {
      expect(await errorsOf({ quantity })).toEqual([]);
    },
  );

  it.each(['0', '0.000', '-1', '1000000000', '1.2345'])(
    'rejects quantity %s',
    async (quantity) => {
      expect(await errorsOf({ quantity })).toEqual(['quantity']);
    },
  );

  it.each(['spoiled', undefined])(
    'rejects wasteReason %s',
    async (wasteReason) => {
      expect(await errorsOf({ wasteReason })).toEqual(['wasteReason']);
    },
  );
});
