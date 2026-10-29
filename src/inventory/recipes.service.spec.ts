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

describe('RecipesService name filter', () => {
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
});
