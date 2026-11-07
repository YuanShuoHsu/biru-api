import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { I18nContext } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';
import type { FilterOperator } from '../common/constants/pagination.js';
import * as schema from '../db/schema/index.js';
import {
  ingredient,
  recipe,
  recipeIngredient,
} from '../db/schema/inventory.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

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
    const result = await service.findAll(ORG, { lowStock: 'true' });

    expect(result.data.map(({ id }) => id)).toEqual(['below', 'equal']);
    expect(result.total).toBe(2);
  });

  it('未帶 lowStock 時列出全部食材', async () => {
    const result = await service.findAll(ORG);

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
    const result = await service.findAll(ORG, { sortBy: 'name' });

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

    const result = await service.findAll(ORG, {
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

describe('IngredientsService name filter and purchasing fields', () => {
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
    (await service.findAll(ORG, { quickFilterValue })).data.map(({ id }) => id);

  const filterName = async (
    filterOperator: FilterOperator,
    filterValue?: string,
  ) =>
    (
      await service.findAll(ORG, {
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

  it('沒有採購權限時查詢單一食材不帶採購欄位', async () => {
    await client.query(
      `update ingredient set price = 100, eligible_quantity = 1000, eligible_quantity_unit_code = 'GRM', url = 'https://example.com' where id = 'milk'`,
    );

    const visible = await service.findOne('milk');
    const hidden = await service.findOne('milk', false);

    expect(visible).toMatchObject({
      price: '100.00',
      url: 'https://example.com',
    });
    for (const field of [
      'price',
      'supplierId',
      'supplierName',
      'unitPrice',
      'url',
    ])
      expect(hidden[field as keyof typeof hidden], field).toBeUndefined();
    expect(hidden).toMatchObject({ id: 'milk', priceCurrency: 'TWD' });
  });

  it('沒有採購權限時依採購欄位排序或篩選回 403 forbidden', async () => {
    await expect(
      service.findAll(ORG, { sortBy: 'price' }, false),
    ).rejects.toMatchObject({ response: { code: 'forbidden' } });
    await expect(
      service.findAll(
        ORG,
        {
          filterField: 'supplierName',
          filterOperator: 'equals',
          filterValue: 'x',
        },
        false,
      ),
    ).rejects.toMatchObject({ response: { code: 'forbidden' } });
  });
});

describe('IngredientsService remove', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: IngredientsService;

  const inUse = {
    response: { code: 'ingredientInUse' },
    status: 409,
  };

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new IngredientsService(
      db as unknown as DrizzleDB,
      {} as InventoryTransactionsService,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate ingredient, recipe, organization cascade');
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
    await db.insert(ingredient).values(
      ['milk', 'sugar'].map((id, index) => ({
        id,
        name: { 'zh-TW': id },
        organizationId: ORG,
        sortOrder: index,
        unitCode: 'GRM' as const,
      })),
    );
    await db
      .insert(recipe)
      .values({ id: 'latte', name: { 'zh-TW': '拿鐵' }, organizationId: ORG });
    await db.insert(recipeIngredient).values({
      id: 'latteMilk',
      recipeId: 'latte',
      ingredientId: 'milk',
      requiredQuantity: '200',
    });
  });

  it('刪除仍被食譜使用的食材回 409 ingredientInUse', async () => {
    await expect(service.remove('milk')).rejects.toMatchObject(inUse);
  });

  it('批次刪除含仍被食譜使用的食材時回 409 ingredientInUse', async () => {
    await expect(
      service.removeMany(ORG, ['sugar', 'milk']),
    ).rejects.toMatchObject(inUse);
    expect(
      (await client.query('select id from ingredient order by id')).rows,
    ).toEqual([{ id: 'milk' }, { id: 'sugar' }]);
  });
});

describe('IngredientsService unlimitedStock', () => {
  let client: PGlite;
  let service: IngredientsService;

  const dto = {
    eligibleQuantity: '1000',
    eligibleQuantityUnitCode: 'LTR' as const,
    name: { 'zh-TW': '水' },
    price: '12.08',
    unitCode: 'MLT' as const,
  };

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address)
       values ('${ORG}', 'biru', 'biru', now(), 'TW', '中壢區', '桃園市', '中正路')`,
    );
    service = new IngredientsService(
      db as unknown as DrizzleDB,
      {} as InventoryTransactionsService,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('預設追蹤庫存', async () => {
    const created = await service.create(ORG, {
      ...dto,
      lowStockThreshold: '100',
    });

    expect(created.unlimitedStock).toBe(false);
    expect(created.lowStockThreshold).toBe('100.000');
  });

  it('開過不限量再改回追蹤時，警示量與庫存都保留', async () => {
    const { id } = await service.create(ORG, {
      ...dto,
      lowStockThreshold: '100',
    });
    await client.query(
      `update ingredient set inventory_level = 500 where id = '${id}'`,
    );

    const unlimited = await service.update(id, { unlimitedStock: true });
    expect(unlimited.lowStockThreshold).toBe('100.000');

    const tracked = await service.update(id, { unlimitedStock: false });
    expect(tracked.unlimitedStock).toBe(false);
    expect(tracked.lowStockThreshold).toBe('100.000');
    expect(tracked.inventoryLevel).toBe('500.000');
  });

  it('不限量的食材不列入低庫存篩選', async () => {
    const { id } = await service.create(ORG, {
      ...dto,
      lowStockThreshold: '100',
      name: { 'zh-TW': '低庫存但不限量' },
      unlimitedStock: true,
    });

    const { data } = await service.findAll(ORG, { lowStock: 'true' });

    expect(data.map((row) => row.id)).not.toContain(id);
  });
});
