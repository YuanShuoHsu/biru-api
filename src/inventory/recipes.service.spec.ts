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
    await client.exec(`
      insert into menu (id, organization_id, name) values ('menu', '${ORG}', '{"zh-TW":"菜單"}');
      insert into menu_item (id, menu_id, name) values ('latte-item', 'menu', '{"zh-TW":"拿鐵"}');
    `);
    await db.insert(recipe).values([
      {
        id: 'latte',
        name: { en: 'Latte', 'zh-TW': '拿鐵' },
        organizationId: ORG,
        menuItemId: 'latte-item',
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

  it('售價取品項的第一筆 offer，第一筆沒有價格時不改用後面的 offer', async () => {
    try {
      await client.exec(`
        insert into offer (id, menu_item_id, created_at) values ('unpriced', 'latte-item', '2026-01-01');
        insert into offer (id, menu_item_id, price, created_at) values ('priced', 'latte-item', 120, '2026-01-02');
      `);
      expect((await service.findOne('latte')).price).toBeNull();

      await client.exec(`update offer set price = 90 where id = 'unpriced'`);
      expect((await service.findOne('latte')).price).toBe(90);
    } finally {
      await client.exec(`delete from offer where id in ('unpriced', 'priced')`);
    }
  });

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

  it('依是否綁定菜單品項篩選食譜', async () => {
    expect(await recipeIds({ hasMenuItem: false })).toEqual(['mocha']);
    expect(await recipeIds({ hasMenuItem: true })).toEqual(['latte']);
    expect(await recipeIds({})).toEqual(['latte', 'mocha']);
  });

  it('依客製選項取得綁定的食譜，沒綁的選項回 null', async () => {
    await client.exec(`
      insert into modifier_group (id, menu_id, display_name) values ('milk-options', 'menu', '{"zh-TW":"奶類"}');
      insert into modifier (id, modifier_group_id, display_name) values ('oat-milk', 'milk-options', '{"zh-TW":"燕麥奶"}'), ('no-milk', 'milk-options', '{"zh-TW":"不加奶"}');
    `);
    await db.insert(recipe).values({
      id: 'oat-milk-recipe',
      name: { 'zh-TW': '燕麥奶' },
      organizationId: ORG,
      modifierId: 'oat-milk',
    });

    expect(await service.findOneByModifier('oat-milk')).toMatchObject({
      id: 'oat-milk-recipe',
      modifierId: 'oat-milk',
    });
    expect(await service.findOneByModifier('no-milk')).toBeNull();
  });

  it('未綁定的食譜不含綁客製選項的食譜', async () => {
    await client.exec(`
      insert into modifier_group (id, menu_id, display_name) values ('syrup-options', 'menu', '{"zh-TW":"糖漿"}');
      insert into modifier (id, modifier_group_id, display_name) values ('vanilla', 'syrup-options', '{"zh-TW":"香草"}');
    `);
    await db.insert(recipe).values({
      id: 'vanilla-recipe',
      name: { 'zh-TW': '香草糖漿' },
      organizationId: ORG,
      modifierId: 'vanilla',
    });

    expect(await recipeIds({ hasMenuItem: false })).toEqual(['mocha']);
    expect(await recipeIds({ hasMenuItem: true })).toEqual(['latte']);
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

  it('沒有採購權限時依成本排序材料回 403 forbidden', async () => {
    await expect(
      service.findAllIngredients('recipe', { sortBy: 'cost' }, false),
    ).rejects.toMatchObject({ response: { code: 'forbidden' } });
  });
});
