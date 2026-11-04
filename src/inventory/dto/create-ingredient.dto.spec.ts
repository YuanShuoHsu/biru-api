import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateIngredientDto,
  UpdateIngredientDto,
} from './create-ingredient.dto.js';

const valid = {
  name: {
    en: 'Matcha Powder',
    ja: '抹茶パウダー',
    ko: '말차 가루',
    'zh-CN': '抹茶粉',
    'zh-TW': '抹茶粉',
  },
  unitCode: 'GRM',
  price: '950.00',
  eligibleQuantity: '100.000',
  eligibleQuantityUnitCode: 'GRM',
};

const errorsOf = async (fields: object) =>
  (
    await validate(
      plainToInstance(CreateIngredientDto, { ...valid, ...fields }),
    )
  ).map(({ property }) => property);

describe('CreateIngredientDto', () => {
  it.each(['0', '950', '950.5', '99999999.99'])(
    'accepts price %s',
    async (price) => {
      expect(await errorsOf({ price })).toEqual([]);
    },
  );

  it.each(['100000000', '1.234', '-1', '+1'])(
    'rejects price %s, which numeric(10,2) cannot hold or is negative',
    async (price) => {
      expect(await errorsOf({ price })).toEqual(['price']);
    },
  );

  it.each(['0.001', '100', '999999999.999'])(
    'accepts eligibleQuantity %s',
    async (eligibleQuantity) => {
      expect(await errorsOf({ eligibleQuantity })).toEqual([]);
    },
  );

  it.each(['0', '0.000', '-1', '1000000000', '1.2345', '+1'])(
    'rejects eligibleQuantity %s, which is not positive or numeric(12,3) cannot hold',
    async (eligibleQuantity) => {
      expect(await errorsOf({ eligibleQuantity })).toEqual([
        'eligibleQuantity',
      ]);
    },
  );

  it.each(['0', '100.000', '999999999.999'])(
    'accepts lowStockThreshold %s',
    async (lowStockThreshold) => {
      expect(await errorsOf({ lowStockThreshold })).toEqual([]);
    },
  );

  it.each(['-1', '1000000000', '1.2345', '+1'])(
    'rejects lowStockThreshold %s',
    async (lowStockThreshold) => {
      expect(await errorsOf({ lowStockThreshold })).toEqual([
        'lowStockThreshold',
      ]);
    },
  );

  it.each(['0', '500.000', '999999999.999'])(
    'accepts inventoryLevel %s',
    async (inventoryLevel) => {
      expect(await errorsOf({ inventoryLevel })).toEqual([]);
    },
  );

  it.each(['1000000000', '1.2345', '+1'])(
    'rejects inventoryLevel %s, which numeric(12,3) cannot hold',
    async (inventoryLevel) => {
      expect(await errorsOf({ inventoryLevel })).toEqual(['inventoryLevel']);
    },
  );

  it.each(['-5', '-0.001', '-999999999.999'])(
    'rejects inventoryLevel %s, since an opening count cannot be negative',
    async (inventoryLevel) => {
      expect(await errorsOf({ inventoryLevel })).toEqual(['inventoryLevel']);
    },
  );
});

describe('CreateIngredientDto recipeId', () => {
  const sourced = {
    name: valid.name,
    recipeId: 'sauce',
    unitCode: 'GRM',
  };

  const sourcedErrorsOf = async (
    dto: typeof CreateIngredientDto | typeof UpdateIngredientDto,
    fields: object,
  ) =>
    (await validate(plainToInstance(dto, { ...sourced, ...fields }))).map(
      ({ property }) => property,
    );

  it('有來源食譜時不必帶包裝與價錢', async () => {
    expect(await sourcedErrorsOf(CreateIngredientDto, {})).toEqual([]);
  });

  it('沒有來源食譜時包裝與價錢仍必填', async () => {
    expect(
      await sourcedErrorsOf(CreateIngredientDto, { recipeId: undefined }),
    ).toEqual(['price', 'eligibleQuantity', 'eligibleQuantityUnitCode']);
  });

  it.each([
    { price: '950.00' },
    { eligibleQuantity: '100.000' },
    { eligibleQuantityUnitCode: 'GRM' },
    { supplierId: 'supplier' },
  ])('有來源食譜時拒絕 %o', async (fields) => {
    expect(await sourcedErrorsOf(CreateIngredientDto, fields)).toEqual([
      'recipeId',
    ]);
    expect(await sourcedErrorsOf(UpdateIngredientDto, fields)).toEqual([
      'recipeId',
    ]);
  });

  it('清掉來源食譜時可以同時帶價錢', async () => {
    expect(
      await sourcedErrorsOf(UpdateIngredientDto, {
        recipeId: null,
        price: '950.00',
      }),
    ).toEqual([]);
  });
});
