import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateModifierDto } from './create-modifier.dto.js';
import { UpdateModifierDto } from './update-modifier.dto.js';

const displayName = {
  en: 'Pearls',
  ja: 'タピオカ',
  ko: '펄',
  'zh-CN': '珍珠',
  'zh-TW': '珍珠',
};

const errorsOf = async (
  dto: typeof CreateModifierDto | typeof UpdateModifierDto,
  priceAdjustment: string | null,
) =>
  (await validate(plainToInstance(dto, { displayName, priceAdjustment }))).map(
    ({ property }) => property,
  );

describe.each([CreateModifierDto, UpdateModifierDto])('%o', (dto) => {
  it.each(['0', '10', '10.5', '10.00', '99999999.99', null])(
    'accepts priceAdjustment %s',
    async (priceAdjustment) => {
      expect(await errorsOf(dto, priceAdjustment)).toEqual([]);
    },
  );

  it.each(['100000000', '1.234', '-5', '1e5', ''])(
    'rejects priceAdjustment %s, which numeric(10,2) or a surcharge cannot hold',
    async (priceAdjustment) => {
      expect(await errorsOf(dto, priceAdjustment)).toEqual(['priceAdjustment']);
    },
  );
});
