import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateModifierGroupDto } from './create-modifier-group.dto.js';
import { UpdateModifierGroupDto } from './update-modifier-group.dto.js';

const displayName = {
  en: 'Sweetness',
  ja: '甘さ',
  ko: '당도',
  'zh-CN': '甜度',
  'zh-TW': '甜度',
};

const errorsOf = async (
  dto: typeof CreateModifierGroupDto | typeof UpdateModifierGroupDto,
  counts: { minSelectionCount?: number; maxSelectionCount?: number },
) =>
  (await validate(plainToInstance(dto, { displayName, ...counts }))).map(
    ({ property }) => property,
  );

describe.each([CreateModifierGroupDto, UpdateModifierGroupDto])('%o', (dto) => {
  it('accepts selection counts of 99', async () => {
    expect(
      await errorsOf(dto, { minSelectionCount: 99, maxSelectionCount: 99 }),
    ).toEqual([]);
  });

  it.each([100, 3000000000])(
    'rejects selection counts of %i',
    async (count) => {
      expect(
        await errorsOf(dto, {
          minSelectionCount: count,
          maxSelectionCount: count,
        }),
      ).toEqual(['minSelectionCount', 'maxSelectionCount']);
    },
  );
});
