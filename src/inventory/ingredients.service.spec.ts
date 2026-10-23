import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

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
    client = new PGlite();
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
      `insert into organization (id, name, slug, created_at) values ($1, 'Biru', 'biru', now())`,
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
