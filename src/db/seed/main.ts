import type { Faker } from '@faker-js/faker';
import {
  fakerEN,
  fakerJA,
  fakerKO,
  fakerZH_CN,
  fakerZH_TW,
} from '@faker-js/faker';

import { reset, seed } from 'drizzle-seed';

import { db } from '..';
import * as schema from '../schema';

import type { LocalizedText } from '../../common/types/locale';

const generateLocalizedItem = (
  generator: (f: Faker, locale: keyof LocalizedText) => string,
) => {
  const localized: LocalizedText = {
    en: generator(fakerEN, 'en'),
    'zh-TW': generator(fakerZH_TW, 'zh-TW'),
    ja: generator(fakerJA, 'ja'),
    ko: generator(fakerKO, 'ko'),
    'zh-CN': generator(fakerZH_CN, 'zh-CN'),
  };

  return JSON.stringify(localized);
};

const generateStoreNames = (count: number) =>
  Array.from({ length: count }, () =>
    generateLocalizedItem((f) => f.company.name()),
  );

const generateTableNames = (count: number) =>
  Array.from({ length: count }, () =>
    generateLocalizedItem((f, locale) => {
      const prefix = {
        en: 'Table',
        'zh-TW': '桌號',
        ja: '卓',
        ko: '테이블',
        'zh-CN': '桌号',
      }[locale];
      return `${prefix} ${f.string.numeric(2)}`;
    }),
  );

const generateMenuNames = (count: number) =>
  Array.from({ length: count }, () =>
    generateLocalizedItem((f) => f.commerce.productName()),
  );

const generateMenuItemNames = (count: number) =>
  Array.from({ length: count }, () =>
    generateLocalizedItem((f) => f.food.dish()),
  );

const generateDescriptions = (count: number) =>
  Array.from({ length: count }, () =>
    generateLocalizedItem((f) => f.food.description()),
  );

const generateImageUrls = (count: number) =>
  Array.from({ length: count }, () => fakerEN.image.url());

const generateIngredientNames = (count: number) =>
  Array.from({ length: count }, () =>
    generateLocalizedItem((f) => f.food.ingredient()),
  );

const generateUnitNames = (count: number) =>
  Array.from({ length: count }, () =>
    generateLocalizedItem((f) => f.science.unit().name),
  );

const generateOptionNames = (count: number) =>
  Array.from({ length: count }, () =>
    generateLocalizedItem((f) => f.commerce.productAdjective()),
  );

const generateChoiceNames = (count: number) =>
  Array.from({ length: count }, () =>
    generateLocalizedItem((f) => f.commerce.productMaterial()),
  );

async function main() {
  await reset(db, schema);

  await seed(db, schema).refine((funcs) => ({
    stores: {
      count: 10,
      columns: {
        name: funcs.valuesFromArray({ values: generateStoreNames(20) }),
        address: funcs.streetAddress(),
        isActive: funcs.default({ defaultValue: true }),
        slug: funcs.uuid(),
      },
    },
    tables: {
      count: 40,
      columns: {
        name: funcs.valuesFromArray({ values: generateTableNames(100) }),
        isActive: funcs.boolean(),
        slug: funcs.uuid(),
      },
    },
    menus: {
      count: 20,
      columns: {
        name: funcs.valuesFromArray({ values: generateMenuNames(50) }),
        key: funcs.uuid(),
        isActive: funcs.boolean(),
      },
    },
    menuItems: {
      count: 100,
      columns: {
        name: funcs.valuesFromArray({ values: generateMenuItemNames(200) }),
        key: funcs.uuid(),
        description: funcs.valuesFromArray({
          values: generateDescriptions(200),
        }),
        image: funcs.valuesFromArray({ values: generateImageUrls(100) }),
        isActive: funcs.boolean(),
        price: funcs.int({ minValue: 50, maxValue: 1000 }),
        sold: funcs.int({ minValue: 0, maxValue: 5000 }),
        stock: funcs.int({ minValue: 0, maxValue: 200 }),
      },
    },
    menuItemIngredients: {
      count: 200,
      columns: {
        name: funcs.valuesFromArray({ values: generateIngredientNames(300) }),
        unit: funcs.valuesFromArray({ values: generateUnitNames(50) }),
        key: funcs.uuid(),
        usage: funcs.int({ minValue: 1, maxValue: 10 }),
      },
    },
    menuItemOptions: {
      count: 60,
      columns: {
        name: funcs.valuesFromArray({ values: generateOptionNames(100) }),
        key: funcs.uuid(),
        isActive: funcs.boolean(),
        multiple: funcs.boolean(),
        required: funcs.boolean(),
      },
      with: {
        menuItemOptionChoices: [
          { weight: 0.4, count: [2, 3] },
          { weight: 0.6, count: [4, 5] },
        ],
      },
    },
    menuItemOptionChoices: {
      columns: {
        name: funcs.valuesFromArray({ values: generateChoiceNames(300) }),
        key: funcs.uuid(),
        extraCost: funcs.int({ minValue: 0, maxValue: 100 }),
        isActive: funcs.boolean(),
        isShared: funcs.boolean(),
        sold: funcs.int({ minValue: 0, maxValue: 500 }),
        stock: funcs.int({ minValue: 0, maxValue: 100 }),
      },
    },
    menuItemOptionChoiceIngredients: {
      count: 100,
      columns: {
        key: funcs.uuid(),
        name: funcs.valuesFromArray({ values: generateIngredientNames(200) }),
        unit: funcs.valuesFromArray({ values: generateUnitNames(50) }),
        usage: funcs.int({ minValue: 1, maxValue: 10 }),
      },
    },
  }));
}

void main();
