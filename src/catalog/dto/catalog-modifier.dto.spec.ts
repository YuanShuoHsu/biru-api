import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateCatalogModifierDto } from './create-catalog-modifier.dto.js';
import { UpdateCatalogModifierDto } from './update-catalog-modifier.dto.js';

const displayName = {
  en: 'Own cup',
  ja: 'マイカップ',
  ko: '개인 컵',
  'zh-CN': '自带杯',
  'zh-TW': '自備杯',
};

const errorsOf = async (cls: new () => object, fields: object) =>
  (await validate(plainToInstance(cls, fields))).map(
    ({ property }) => property,
  );

describe('catalog modifier cup fields', () => {
  it.each([CreateCatalogModifierDto, UpdateCatalogModifierDto])(
    '%p 接受自備杯、杯型與封口，杯型與封口可為 null',
    async (cls) => {
      expect(
        await errorsOf(cls, {
          displayName,
          customerProvidedCup: true,
          cupSize: '12oz',
          cupSeal: 'film',
        }),
      ).toEqual([]);
      expect(
        await errorsOf(cls, {
          displayName,
          cupSize: null,
          cupSeal: null,
        }),
      ).toEqual([]);
    },
  );

  it.each([CreateCatalogModifierDto, UpdateCatalogModifierDto])(
    '%p 拒絕 null 的自備杯與不在列舉內的杯型、封口',
    async (cls) => {
      expect(
        await errorsOf(cls, {
          displayName,
          customerProvidedCup: null,
          cupSize: '20oz',
          cupSeal: 'straw',
        }),
      ).toEqual(['customerProvidedCup', 'cupSize', 'cupSeal']);
    },
  );
});
