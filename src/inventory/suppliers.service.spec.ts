import { PGlite } from '@electric-sql/pglite';
import { NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { I18nContext } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import { ingredient, recipe, supplier } from '../db/schema/inventory.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { SuppliersService } from './suppliers.service.js';

const ORG = 'org';

describe('SuppliersService.findOne', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: SuppliersService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new SuppliersService(db as unknown as DrizzleDB);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      'truncate ingredient, recipe, supplier, organization cascade',
    );
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
    await db
      .insert(supplier)
      .values({ id: 'supplier', name: '宇治', organizationId: ORG });
    await db.insert(ingredient).values(
      [
        { id: 'zebra', name: { en: 'Zebra', 'zh-TW': '一' } },
        { id: 'apple', name: { en: 'Apple', 'zh-TW': '二' } },
        { id: 'untranslated', name: { 'zh-TW': '三' } },
      ].map((row) => ({
        ...row,
        organizationId: ORG,
        supplierId: 'supplier',
        unitCode: 'GRM' as const,
      })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('供應商同名時依 id 排出固定順序', async () => {
    await db.insert(supplier).values(
      ['c', 'a', 'b'].map((id) => ({
        id,
        name: '同名',
        organizationId: ORG,
      })),
    );

    const { data } = await service.findAll(ORG, {
      filterField: 'name',
      filterOperator: 'equals',
      filterValue: '同名',
    });

    expect(data.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  it('依目前語系的名稱排序供應商的食材', async () => {
    const { ingredients, name } = await service.findOne('supplier');

    expect(name).toBe('宇治');
    expect(ingredients.map(({ id }) => id)).toEqual([
      'zebra',
      'untranslated',
      'apple',
    ]);
  });

  it('目前語系沒有翻譯時以預設語系的名稱排序', async () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      lang: 'en',
    } as I18nContext);

    const { ingredients } = await service.findOne('supplier');

    expect(ingredients.map(({ id }) => id)).toEqual([
      'apple',
      'zebra',
      'untranslated',
    ]);
  });

  it('不能把由來源食譜製成的食材綁到供應商', async () => {
    await db
      .insert(recipe)
      .values({ id: 'syrup', name: { 'zh-TW': '糖漿' }, organizationId: ORG });
    await db.insert(ingredient).values({
      id: 'sourced',
      name: { 'zh-TW': '自製糖漿' },
      organizationId: ORG,
      recipeId: 'syrup',
      unitCode: 'GRM',
    });

    await expect(
      service.update('supplier', { ingredientIds: ['apple', 'sourced'] }),
    ).rejects.toMatchObject({
      response: { code: 'purchaseFieldsOnSourcedIngredient' },
      status: 400,
    });
    await expect(
      service.create(ORG, { name: '新供應商', ingredientIds: ['sourced'] }),
    ).rejects.toMatchObject({
      response: { code: 'purchaseFieldsOnSourcedIngredient' },
      status: 400,
    });
    expect(
      await db
        .select({ id: ingredient.id, supplierId: ingredient.supplierId })
        .from(ingredient)
        .orderBy(ingredient.id),
    ).toEqual([
      { id: 'apple', supplierId: 'supplier' },
      { id: 'sourced', supplierId: null },
      { id: 'untranslated', supplierId: 'supplier' },
      { id: 'zebra', supplierId: 'supplier' },
    ]);
  });

  it('之前已綁定的來源食譜食材不擋，供應商仍可照原清單更新', async () => {
    await db
      .insert(recipe)
      .values({ id: 'syrup', name: { 'zh-TW': '糖漿' }, organizationId: ORG });
    await db
      .update(ingredient)
      .set({ recipeId: 'syrup' })
      .where(eq(ingredient.id, 'apple'));

    const updated = await service.update('supplier', {
      ingredientIds: ['apple', 'zebra'],
      name: '宇治抹茶',
    });

    expect(updated.name).toBe('宇治抹茶');
    expect(updated.ingredients.map(({ id }) => id).sort()).toEqual([
      'apple',
      'zebra',
    ]);
  });

  it('找不到供應商時回 404', async () => {
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('找不到供應商時帶代碼與目前語系的訊息', async () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string) => `translated:${key}`,
    } as unknown as I18nContext);

    await expect(service.findOne('missing')).rejects.toMatchObject({
      response: {
        code: 'supplierNotFound',
        message: 'translated:common.inventory.supplierNotFound',
      },
    });
  });
});
