import { EventEmitter2 } from '@nestjs/event-emitter';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import { ingredient } from '../db/schema/inventory.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { LOW_STOCK_REACHED_EVENT } from '../events/low-stock-reached.event.js';

import { IngredientsService } from './ingredients.service.js';
import { InventoryTransactionsService } from './inventory-transactions.service.js';

const ORG = 'org';

describe('盤點的低庫存通知', () => {
  let client: PGlite;
  let db: DrizzleDB;
  let eventEmitter: EventEmitter2;
  let service: InventoryTransactionsService;
  let ingredients: IngredientsService;

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as DrizzleDB;
    eventEmitter = new EventEmitter2();
    service = new InventoryTransactionsService(db, eventEmitter);
    ingredients = new IngredientsService(db, service);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate ingredient, organization cascade');
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, $1, $1, now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
    await db.insert(ingredient).values({
      id: 'milk',
      inventoryLevel: '2000',
      lowStockThreshold: '1600',
      name: { 'zh-TW': '牛奶' },
      organizationId: ORG,
      unitCode: 'MLT',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const lowStockEvent = {
    organizationId: ORG,
    ingredients: [{ id: 'milk', name: { 'zh-TW': '牛奶' } }],
  };

  it('盤點到門檻以下時送出通知', async () => {
    const emit = vi.spyOn(eventEmitter, 'emit');

    await service.create('milk', { inventoryLevel: '1600' });

    expect(emit).toHaveBeenCalledWith(LOW_STOCK_REACHED_EVENT, lowStockEvent);
  });

  it('找不到食材時不送通知', async () => {
    const emit = vi.spyOn(eventEmitter, 'emit');

    await expect(
      service.create('missing', { inventoryLevel: '0' }),
    ).rejects.toThrow();
    expect(emit).not.toHaveBeenCalled();
  });

  it.each([
    ['仍在門檻以上', '2000', '1700'],
    ['原本就在門檻以下', '1500', '1000'],
    ['盤點後回到門檻以上', '1500', '1800'],
  ])('%s時不送通知', async (_, before, counted) => {
    await client.query(
      `update ingredient set inventory_level = $1 where id = 'milk'`,
      [before],
    );
    const emit = vi.spyOn(eventEmitter, 'emit');

    await service.create('milk', { inventoryLevel: counted });

    expect(emit).not.toHaveBeenCalled();
  });

  it('不限量的食材不送通知', async () => {
    await client.query(
      `update ingredient set unlimited_stock = true where id = 'milk'`,
    );
    const emit = vi.spyOn(eventEmitter, 'emit');

    await service.create('milk', { inventoryLevel: '0' });

    expect(emit).not.toHaveBeenCalled();
  });

  it('編輯食材時一併盤點到門檻以下，送出通知', async () => {
    const emit = vi.spyOn(eventEmitter, 'emit');

    await ingredients.update('milk', { inventoryLevel: '1000' });

    expect(emit).toHaveBeenCalledWith(LOW_STOCK_REACHED_EVENT, lowStockEvent);
  });

  it('編輯食材沒有改數量時不送通知', async () => {
    const emit = vi.spyOn(eventEmitter, 'emit');

    await ingredients.update('milk', { lowStockThreshold: '2500' });

    expect(emit).not.toHaveBeenCalled();
  });
});
