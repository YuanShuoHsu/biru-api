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

  it.each([0, 44639])(
    'accepts a lead time of %i minutes',
    async (deliveryLeadTimeMinutes) => {
      expect(await errorsOf({ price: '100', deliveryLeadTimeMinutes })).toEqual(
        [],
      );
    },
  );

  it.each([44640, 3000000000])(
    'rejects a lead time of %i minutes, longer than the pickup window',
    async (deliveryLeadTimeMinutes) => {
      expect(await errorsOf({ price: '100', deliveryLeadTimeMinutes })).toEqual(
        ['deliveryLeadTimeMinutes'],
      );
    },
  );

  it.each([
    ['2025-06-01', '2025-06-30'],
    ['2025-06-01', '2025-06-01'],
    ['2025-06-01', undefined],
    [undefined, '2025-06-30'],
  ])('accepts promo dates %s to %s', async (validFrom, validThrough) => {
    expect(
      await errorsOf({
        price: '100',
        priceSpecification: { price: '80', validFrom, validThrough },
      }),
    ).toEqual([]);
  });

  it.each(['2025-06-01T00:00:00+08:00', '2026-W01', '2025-02-30', '20250601'])(
    'rejects promo date %s, which is not a calendar date',
    async (date) => {
      expect(
        await errorsOf({
          price: '100',
          priceSpecification: {
            price: '80',
            validFrom: date,
            validThrough: date,
          },
        }),
      ).toEqual([
        'priceSpecification.validFrom',
        'priceSpecification.validThrough',
      ]);
    },
  );

  it('rejects a promo that ends before it starts', async () => {
    expect(
      await errorsOf({
        price: '100',
        priceSpecification: {
          price: '80',
          validFrom: '2025-06-02',
          validThrough: '2025-06-01',
        },
      }),
    ).toEqual(['priceSpecification.validThrough']);
  });
});
