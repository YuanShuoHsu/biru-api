import { PGlite } from '@electric-sql/pglite';
import { createPGlite } from '../../test/pglite.js';
import { NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { I18nContext } from 'nestjs-i18n';

import * as schema from '../db/schema/index.js';
import { ingredient, supplier } from '../db/schema/inventory.js';
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
    await client.exec('truncate ingredient, supplier, organization cascade');
    await client.query(
      `insert into organization (id, name, slug, created_at) values ($1, 'Biru', 'biru', now())`,
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

  it('找不到供應商時回 404', async () => {
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
