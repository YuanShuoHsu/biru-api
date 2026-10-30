import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

import { CreateOfferDto } from './create-offer.dto.js';

const pathsOf = (errors: ValidationError[], parent = ''): string[] =>
  errors.flatMap(({ property, children }) => {
    const path = parent ? `${parent}.${property}` : property;
    return children?.length ? pathsOf(children, path) : [path];
  });

const errorsOf = async (fields: object) =>
  pathsOf(await validate(plainToInstance(CreateOfferDto, fields)));

describe('CreateOfferDto', () => {
  it.each(['0', '150', '150.5', '150.00', '99999999.99'])(
    'accepts price %s',
    async (price) => {
      expect(await errorsOf({ price, priceSpecification: { price } })).toEqual(
        [],
      );
    },
  );

  it.each(['100000000', '1.234', '-1', '1e5', ''])(
    'rejects price %s, which numeric(10,2) cannot hold',
    async (price) => {
      expect(await errorsOf({ price, priceSpecification: { price } })).toEqual([
        'price',
        'priceSpecification.price',
      ]);
    },
  );

  it('accepts a sold-out stock level of zero', async () => {
    expect(
      await errorsOf({ price: '100', inventoryLevel: { value: 0 } }),
    ).toEqual([]);
  });

  it('rejects a negative stock level', async () => {
    expect(
      await errorsOf({ price: '100', inventoryLevel: { value: -1 } }),
    ).toEqual(['inventoryLevel.value']);
  });
});
