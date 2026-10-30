import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import {
  ingredient,
  recipe,
  recipeIngredient,
} from '../db/schema/inventory.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { RecipesService } from './recipes.service.js';

const ORG = 'org';

describe('RecipesService', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: RecipesService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new RecipesService(db as unknown as DrizzleDB);
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
    await db.insert(ingredient).values(
      [
        { id: 'milk', name: { en: 'Whole Milk', 'zh-TW': '全脂牛奶' } },
        { id: 'beans', name: { en: 'Coffee Beans', 'zh-TW': '咖啡豆' } },
      ].map((row, index) => ({
        ...row,
        organizationId: ORG,
        sortOrder: index,
        unitCode: 'GRM' as const,
      })),
    );
    await db.insert(recipe).values([
      {
        id: 'latte',
        name: { en: 'Latte', 'zh-TW': '拿鐵' },
        organizationId: ORG,
      },
      { id: 'mocha', name: { 'zh-TW': '摩卡' }, organizationId: ORG },
    ]);
    await db.insert(recipeIngredient).values([
      {
        id: 'a',
        recipeId: 'latte',
        ingredientId: 'milk',
        requiredQuantity: '200',
        sortOrder: 0,
      },
      {
        id: 'b',
        recipeId: 'latte',
        ingredientId: 'beans',
        requiredQuantity: '18',
        sortOrder: 1,
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  const recipeIds = async (query: Parameters<RecipesService['findAll']>[1]) =>
    (await service.findAll(ORG, query)).data.map(({ id }) => id);

  const materialIds = async (
    query: Parameters<RecipesService['findAllIngredients']>[1],
  ) =>
    (await service.findAllIngredients('latte', query)).data.map(
      ({ ingredientId }) => ingredientId,
    );

  it('食譜名稱的快速搜尋與篩選不比對語系鍵', async () => {
    expect(await recipeIds({ quickFilterValue: 'zh' })).toEqual([]);
    expect(await recipeIds({ quickFilterValue: '摩卡' })).toEqual(['mocha']);
    expect(await recipeIds({ quickFilterValue: 'lat' })).toEqual(['latte']);
    expect(
      await recipeIds({
        filterField: 'name',
        filterOperator: 'equals',
        filterValue: 'Latte',
      }),
    ).toEqual(['latte']);
  });

  it('食譜材料名稱的快速搜尋與篩選不比對語系鍵', async () => {
    expect(await materialIds({ quickFilterValue: 'TW' })).toEqual([]);
    expect(await materialIds({ quickFilterValue: '咖啡' })).toEqual(['beans']);
    expect(
      await materialIds({
        filterField: 'ingredientName',
        filterOperator: 'contains',
        filterValue: 'en',
      }),
    ).toEqual([]);
    expect(
      await materialIds({
        filterField: 'ingredientName',
        filterOperator: 'startsWith',
        filterValue: 'whole',
      }),
    ).toEqual(['milk']);
  });

  it('建立食譜時寫入送出的欄位，指定不綁品項時不自動綁定', async () => {
    const created = await service.create(ORG, {
      menuItemId: null,
      name: { 'zh-TW': '焙茶拿鐵' },
      recipeInstructions: [{ 'zh-TW': '茶葉沖泡 3 分鐘' }],
      recipeYield: 2,
    });

    expect(created).toMatchObject({
      menuItemId: null,
      name: { 'zh-TW': '焙茶拿鐵' },
      organizationId: ORG,
      recipeInstructions: [{ 'zh-TW': '茶葉沖泡 3 分鐘' }],
      recipeYield: 2,
    });
  });

  it('建立食譜沒指定品項時依名稱綁定，找不到同名品項就不綁', async () => {
    const created = await service.create(ORG, {
      name: { 'zh-TW': '冷萃' },
    });

    expect(created.menuItemId).toBeNull();
  });

  it('新增材料沒給排序時排在最後，給了就照給的；詳細資料帶出全部材料', async () => {
    const { id: recipeId } = await service.create(ORG, {
      menuItemId: null,
      name: { 'zh-TW': '黑糖拿鐵' },
    });
    const appended = await service.createIngredient(recipeId, {
      ingredientId: 'milk',
      requiredQuantity: '150',
    });
    const placed = await service.createIngredient(recipeId, {
      ingredientId: 'beans',
      requiredQuantity: '18',
      sortOrder: 5,
    });

    expect(appended).toMatchObject({
      ingredientId: 'milk',
      requiredQuantity: '150.000',
      sortOrder: 0,
    });
    expect(placed).toMatchObject({ ingredientId: 'beans', sortOrder: 5 });
    expect(
      (await service.findOne(recipeId)).recipeIngredients?.map(
        ({ ingredientId }) => ingredientId,
      ),
    ).toEqual(['milk', 'beans']);
  });
});
