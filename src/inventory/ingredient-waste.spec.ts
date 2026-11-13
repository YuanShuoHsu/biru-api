import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import { ingredient, inventoryTransaction } from '../db/schema/inventory.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { LOW_STOCK_REACHED_EVENT } from '../events/low-stock-reached.event.js';

import { InventoryTransactionsService } from './inventory-transactions.service.js';

const ORG = 'org';

const responseOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as BadRequestException).getResponse() as {
      code: string;
      ingredients?: { id: string; shortfall: string }[];
    };
  }

  throw new Error('expected a rejection');
};

describe('登記食材報廢', () => {
  let client: PGlite;
  let db: DrizzleDB;
  let eventEmitter: EventEmitter2;
  let service: InventoryTransactionsService;

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as DrizzleDB;
    eventEmitter = new EventEmitter2();
    service = new InventoryTransactionsService(db, eventEmitter);
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
      eligibleQuantity: '1',
      eligibleQuantityUnitCode: 'LTR',
      inventoryLevel: '2000',
      lowStockThreshold: '1600',
      name: { 'zh-TW': '牛奶' },
      organizationId: ORG,
      price: '100',
      unitCode: 'MLT',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const levelOf = async () => {
    const [row] = await db
      .select({ inventoryLevel: ingredient.inventoryLevel })
      .from(ingredient)
      .where(eq(ingredient.id, 'milk'));

    return Number(row.inventoryLevel);
  };

  it('扣掉報廢量並以目前進價記一筆負向異動，帳本原因為 waste', async () => {
    const created = await service.waste('milk', {
      note: '過期',
      quantity: '250',
      wasteReason: 'expired',
    });

    expect(await levelOf()).toBe(1750);
    expect(created).toMatchObject({
      balance: '1750.000',
      ingredientId: 'milk',
      note: '過期',
      orderId: null,
      productionBatchId: null,
      quantity: '-250.000',
      reason: 'waste',
      wasteReason: 'expired',
    });
    expect(Number(created.unitCost)).toBeCloseTo(0.1);

    const { data } = await service.findAll('milk');
    expect(
      data.map(({ quantity, reason, wasteReason }) => ({
        quantity,
        reason,
        wasteReason,
      })),
    ).toEqual([
      { quantity: '-250.000', reason: 'waste', wasteReason: 'expired' },
    ]);
    expect(
      (await service.findAll('milk', { quickFilterEnums: ['reason:waste'] }))
        .total,
    ).toBe(1);
  });

  it('流水帳可依報廢原因篩選與排序', async () => {
    await service.waste('milk', { quantity: '1', wasteReason: 'spilled' });
    await service.waste('milk', { quantity: '2', wasteReason: 'expired' });

    const filtered = await service.findAll('milk', {
      filterField: 'wasteReason',
      filterOperator: 'is',
      filterValue: 'spilled',
    });
    expect(filtered.data.map(({ quantity }) => quantity)).toEqual(['-1.000']);
    expect(filtered.total).toBe(1);

    const sorted = await service.findAll('milk', {
      sortBy: 'wasteReason',
      sortDirection: 'asc',
    });
    expect(sorted.data.map(({ wasteReason }) => wasteReason)).toEqual([
      'expired',
      'spilled',
    ]);

    expect(
      (
        await service.findAll('milk', {
          quickFilterEnums: ['wasteReason:expired'],
        })
      ).total,
    ).toBe(1);
    expect(
      (
        await service.findAll('milk', {
          filterField: 'wasteReason',
          filterOperator: 'is',
          filterValue: 'unknown',
        })
      ).total,
    ).toBe(0);
  });

  it('報廢量超過帳上庫存時以 wasteExceedsStock 擋下且不寫入異動', async () => {
    const response = await responseOf(
      service.waste('milk', { quantity: '2000.001', wasteReason: 'spilled' }),
    );

    expect(response.code).toBe('wasteExceedsStock');
    expect(response.ingredients).toEqual([
      { id: 'milk', name: { 'zh-TW': '牛奶' }, shortfall: '0.001' },
    ]);
    expect(await levelOf()).toBe(2000);
    expect(await db.select().from(inventoryTransaction)).toEqual([]);
  });

  it('剛好報廢到 0 時可以登記', async () => {
    await service.waste('milk', { quantity: '2000', wasteReason: 'damaged' });

    expect(await levelOf()).toBe(0);
  });

  it('降到低庫存門檻時送出通知', async () => {
    const emit = vi.spyOn(eventEmitter, 'emit');

    await service.waste('milk', { quantity: '500', wasteReason: 'madeWrong' });

    expect(emit).toHaveBeenCalledWith(LOW_STOCK_REACHED_EVENT, {
      organizationId: ORG,
      ingredients: [{ id: 'milk', name: { 'zh-TW': '牛奶' } }],
    });
  });

  it('找不到食材時回 ingredientNotFound', async () => {
    expect(
      (
        await responseOf(
          service.waste('missing', { quantity: '1', wasteReason: 'other' }),
        )
      ).code,
    ).toBe('ingredientNotFound');
  });

  it('沒有採購權限時不回傳進價', async () => {
    const created = await service.waste(
      'milk',
      { quantity: '1', wasteReason: 'other' },
      false,
    );

    expect(created).not.toHaveProperty('unitCost');
  });
});
