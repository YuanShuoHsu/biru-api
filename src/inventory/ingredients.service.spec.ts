import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { I18nContext, type I18nService } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import { ingredient } from '../db/schema/inventory.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { IngredientsService } from './ingredients.service.js';
import type { InventoryTransactionsService } from './inventory-transactions.service.js';

const ORG = 'org';

describe('IngredientsService.findAll lowStock', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: IngredientsService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new IngredientsService(
      db as unknown as DrizzleDB,
      {} as InventoryTransactionsService,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate ingredient, organization cascade');
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
    await db.insert(ingredient).values(
      [
        { id: 'below', inventoryLevel: '100', lowStockThreshold: '500' },
        { id: 'equal', inventoryLevel: '500', lowStockThreshold: '500' },
        { id: 'above', inventoryLevel: '501', lowStockThreshold: '500' },
        { id: 'noThreshold', inventoryLevel: '0', lowStockThreshold: null },
      ].map((row, index) => ({
        ...row,
        name: { 'zh-TW': row.id },
        organizationId: ORG,
        sortOrder: index,
        unitCode: 'GRM' as const,
      })),
    );
  });

  it('只回傳庫存小於等於門檻的食材，未設門檻者不列入', async () => {
    const result = await service.findAll('biru', { lowStock: 'true' });

    expect(result.data.map(({ id }) => id)).toEqual(['below', 'equal']);
    expect(result.total).toBe(2);
  });

  it('未帶 lowStock 時列出全部食材', async () => {
    const result = await service.findAll('biru');

    expect(result.total).toBe(4);
  });
});

describe('IngredientsService.findAll name sort', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: IngredientsService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new IngredientsService(
      db as unknown as DrizzleDB,
      {} as InventoryTransactionsService,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
    );
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
    await db.insert(ingredient).values(
      [
        { id: 'zebra', name: { en: 'Zebra', 'zh-TW': '一' } },
        { id: 'apple', name: { en: 'Apple', 'zh-TW': '二' } },
        { id: 'untranslated', name: { 'zh-TW': '三' } },
      ].map((row) => ({
        ...row,
        organizationId: ORG,
        sortOrder: 0,
        unitCode: 'GRM' as const,
      })),
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('依名稱排序時取目前語系的名稱', async () => {
    const result = await service.findAll('biru', { sortBy: 'name' });

    expect(result.data.map(({ id }) => id)).toEqual([
      'zebra',
      'untranslated',
      'apple',
    ]);
  });

  it('目前語系沒有翻譯時以預設語系的名稱排序', async () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      lang: 'en',
    } as I18nContext);

    const result = await service.findAll('biru', {
      sortBy: 'name',
      sortDirection: 'desc',
    });

    expect(result.data.map(({ id }) => id)).toEqual([
      'untranslated',
      'zebra',
      'apple',
    ]);
  });
});

describe('IngredientsService.findAll name filter', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: IngredientsService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new IngredientsService(
      db as unknown as DrizzleDB,
      {} as InventoryTransactionsService,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
    );
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
    await db.insert(ingredient).values(
      [
        { id: 'milk', name: { en: 'Whole Milk', 'zh-TW': '全脂牛奶' } },
        { id: 'beans', name: { en: 'Coffee Beans', 'zh-TW': '咖啡豆' } },
        { id: 'sugar', name: { 'zh-TW': '砂糖' } },
      ].map((row, index) => ({
        ...row,
        organizationId: ORG,
        sortOrder: index,
        unitCode: 'GRM' as const,
      })),
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  const quickSearch = async (quickFilterValue: string) =>
    (await service.findAll('biru', { quickFilterValue })).data.map(
      ({ id }) => id,
    );

  const filterName = async (filterOperator: string, filterValue?: string) =>
    (
      await service.findAll('biru', {
        filterField: 'name',
        filterOperator,
        filterValue,
      })
    ).data.map(({ id }) => id);

  it.each(['zh', 'TW', 'en', '"'])(
    '快速搜尋 %s 不會因為語系鍵或 JSON 符號命中',
    async (value) => {
      expect(await quickSearch(value)).toEqual([]);
    },
  );

  it('快速搜尋以名稱片段命中中、英文名稱', async () => {
    expect(await quickSearch('牛奶')).toEqual(['milk']);
    expect(await quickSearch('bean')).toEqual(['beans']);
    expect(await quickSearch('e')).toEqual(['milk', 'beans']);
  });

  it('contains 只比對名稱', async () => {
    expect(await filterName('contains', 'zh')).toEqual([]);
    expect(await filterName('contains', '咖啡')).toEqual(['beans']);
  });

  it('equals 與 startsWith、endsWith 比對任一語系的完整名稱', async () => {
    expect(await filterName('equals', 'Coffee Beans')).toEqual(['beans']);
    expect(await filterName('equals', '砂糖')).toEqual(['sugar']);
    expect(await filterName('startsWith', 'Whole')).toEqual(['milk']);
    expect(await filterName('endsWith', '牛奶')).toEqual(['milk']);
  });

  it('否定的 operator 排除任一語系名稱命中的食材', async () => {
    expect(await filterName('doesNotContain', 'zh')).toEqual([
      'milk',
      'beans',
      'sugar',
    ]);
    expect(await filterName('doesNotContain', 'Milk')).toEqual([
      'beans',
      'sugar',
    ]);
    expect(await filterName('doesNotEqual', '砂糖')).toEqual(['milk', 'beans']);
  });
});
