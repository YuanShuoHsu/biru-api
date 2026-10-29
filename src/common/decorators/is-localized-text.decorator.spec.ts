import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateRecipeDto,
  UpdateRecipeDto,
} from '../../inventory/dto/create-recipe.dto.js';
import { languagesEnum } from '../../db/schema/enums.js';
import { CreateMenuDto } from '../../menus/dto/create-menu.dto.js';

const validationOptions = { forbidNonWhitelisted: true, whitelist: true };

const fullText = (text: string) =>
  Object.fromEntries(
    languagesEnum.enumValues.map((language) => [language, text]),
  );

const errorsOf = async (
  dto: typeof CreateMenuDto | typeof CreateRecipeDto,
  fields: object,
) =>
  (await validate(plainToInstance(dto, fields), validationOptions)).map(
    ({ property }) => property,
  );

describe('IsLocalizedText', () => {
  it('接受只填部分語系的字串物件，值保持原本的物件', async () => {
    const name = { en: 'Lunch', 'zh-TW': '午餐' };
    const dto = plainToInstance(CreateRecipeDto, { name });

    expect(await validate(dto, validationOptions)).toEqual([]);
    expect(dto.name).toEqual(name);
    expect(Object.getPrototypeOf(dto.name)).toBe(Object.prototype);
  });

  it.each([
    [{ fr: 'Déjeuner' }],
    [{ 'zh-TW': 1 }],
    [{ 'zh-TW': null }],
    [{ 'zh-TW': ['午餐'] }],
    ['午餐'],
    [['午餐']],
    [null],
  ])('拒絕不是語系字串物件的值：%j', async (name) => {
    expect(await errorsOf(CreateMenuDto, { name })).toEqual(['name']);
  });

  it('選填欄位全空時轉成 null 並通過', async () => {
    const dto = plainToInstance(CreateMenuDto, {
      description: { en: '', 'zh-TW': ' ' },
      name: fullText('午餐'),
    });

    expect(dto.description).toBeNull();
    expect(await validate(dto, validationOptions)).toEqual([]);
  });

  it('陣列欄位逐項驗證', async () => {
    expect(
      await errorsOf(CreateRecipeDto, {
        name: { 'zh-TW': '抹茶奶酪' },
        recipeInstructions: [{ 'zh-TW': '泡軟' }],
      }),
    ).toEqual([]);
    expect(
      await errorsOf(CreateRecipeDto, {
        name: { 'zh-TW': '抹茶奶酪' },
        recipeInstructions: [{ 'zh-TW': '泡軟' }, '攪拌', { ja: 5 }],
      }),
    ).toEqual(['recipeInstructions']);
  });

  it.each([[['泡軟']], [[1]], [[null]], [[['泡軟']]], [[{ fr: '泡軟' }]]])(
    '陣列裡任一項不是語系字串物件就拒絕：%j',
    async (recipeInstructions) => {
      const name = { 'zh-TW': '抹茶奶酪' };

      expect(
        await errorsOf(CreateRecipeDto, { name, recipeInstructions }),
      ).toEqual(['recipeInstructions']);
      expect(await errorsOf(UpdateRecipeDto, { recipeInstructions })).toEqual([
        'recipeInstructions',
      ]);
    },
  );

  it('選填欄位只有合法的空白語系物件才轉成 null，其他空值照樣拒絕', async () => {
    expect(
      await errorsOf(CreateMenuDto, {
        description: { fr: '' },
        name: fullText('午餐'),
      }),
    ).toEqual(['description']);
    expect(
      await errorsOf(CreateMenuDto, {
        description: { 'zh-TW': null },
        name: fullText('午餐'),
      }),
    ).toEqual(['description']);
  });
});
