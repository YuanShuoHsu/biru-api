import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateProductWasteDto } from './create-product-waste.dto.js';

const MODIFIER_ID = '00000000-0000-4000-8000-000000000011';

const errorsOf = async (body: Record<string, unknown>) =>
  (
    await validate(
      plainToInstance(CreateProductWasteDto, {
        menuItemId: '00000000-0000-4000-8000-000000000001',
        servings: 1,
        wasteReason: 'madeWrong',
        ...body,
      }),
    )
  ).map(({ property }) => property);

describe('CreateProductWasteDto', () => {
  it.each([1, 9999])('accepts servings %s', async (servings) => {
    expect(await errorsOf({ servings })).toEqual([]);
  });

  it.each([0, -1, 1.5, 10000, '1'])('rejects servings %s', async (servings) => {
    expect(await errorsOf({ servings })).toEqual(['servings']);
  });

  it('accepts modifier ids', async () => {
    expect(await errorsOf({ modifierIds: [MODIFIER_ID] })).toEqual([]);
  });

  it.each([[[MODIFIER_ID, MODIFIER_ID]], [['oat']], [MODIFIER_ID]])(
    'rejects modifierIds %j',
    async (modifierIds) => {
      expect(await errorsOf({ modifierIds })).toEqual(['modifierIds']);
    },
  );

  it.each(['latte', undefined])('rejects menuItemId %s', async (menuItemId) => {
    expect(await errorsOf({ menuItemId })).toEqual(['menuItemId']);
  });
});
