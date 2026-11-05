import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import {
  ingredient,
  inventoryTransaction,
  recipe,
  recipeIngredient,
} from '../db/schema/inventory.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { LOW_STOCK_REACHED_EVENT } from '../events/low-stock-reached.event.js';

import { InventoryTransactionsService } from './inventory-transactions.service.js';

const ORG = 'org';
const OTHER_ORG = 'other';

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

describe('製作一批半成品', () => {
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
    await client.exec('truncate recipe, ingredient, organization cascade');
    for (const id of [ORG, OTHER_ORG])
      await client.query(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, $1, $1, now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
        [id],
      );
    await db.insert(recipe).values([
      {
        id: 'sauceRecipe',
        name: { 'zh-TW': '紅醬' },
        organizationId: ORG,
        recipeYieldQuantity: '2',
        recipeYieldUnitCode: 'KGM',
      },
      { id: 'noYield', name: { 'zh-TW': '沒產量' }, organizationId: ORG },
    ]);
    await db.insert(ingredient).values([
      {
        id: 'tomato',
        eligibleQuantity: '1000',
        eligibleQuantityUnitCode: 'GRM',
        inventoryLevel: '2000',
        lowStockThreshold: '1600',
        name: { 'zh-TW': '番茄' },
        organizationId: ORG,
        price: '100',
        unitCode: 'GRM',
      },
      {
        id: 'salt',
        eligibleQuantity: '1',
        eligibleQuantityUnitCode: 'KGM',
        inventoryLevel: '100',
        name: { 'zh-TW': '鹽' },
        organizationId: ORG,
        price: '20',
        unitCode: 'GRM',
      },
      {
        id: 'water',
        eligibleQuantity: '1',
        eligibleQuantityUnitCode: 'LTR',
        name: { 'zh-TW': '水' },
        organizationId: ORG,
        price: '0',
        unitCode: 'MLT',
        unlimitedStock: true,
      },
      {
        id: 'sauce',
        name: { 'zh-TW': '紅醬' },
        organizationId: ORG,
        recipeId: 'sauceRecipe',
        unitCode: 'GRM',
      },
      {
        id: 'unsized',
        name: { 'zh-TW': '沒產量的醬' },
        organizationId: ORG,
        recipeId: 'noYield',
        unitCode: 'GRM',
      },
    ]);
    await db.insert(recipeIngredient).values([
      {
        id: 'line-tomato',
        ingredientId: 'tomato',
        recipeId: 'sauceRecipe',
        requiredQuantity: '1000',
      },
      {
        id: 'line-salt',
        ingredientId: 'salt',
        recipeId: 'sauceRecipe',
        requiredQuantity: '50',
      },
      {
        id: 'line-water',
        ingredientId: 'water',
        recipeId: 'sauceRecipe',
        requiredQuantity: '500',
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const levelOf = async (id: string) => {
    const [row] = await db
      .select({ inventoryLevel: ingredient.inventoryLevel })
      .from(ingredient)
      .where(eq(ingredient.id, id));

    return Number(row.inventoryLevel);
  };

  const transactionsOf = (id: string) =>
    db
      .select()
      .from(inventoryTransaction)
      .where(eq(inventoryTransaction.ingredientId, id));

  it('依實際產出 ÷ 換算成基準單位的食譜產量扣原料並增加半成品', async () => {
    const created = await service.produceBatch(ORG, 'sauce', {
      note: '午餐備料',
      quantity: '1000',
    });

    expect(await levelOf('tomato')).toBe(1500);
    expect(await levelOf('salt')).toBe(75);
    expect(await levelOf('sauce')).toBe(1000);
    expect(created).toMatchObject({
      balance: '1000.000',
      ingredientId: 'sauce',
      note: '午餐備料',
      orderId: null,
      quantity: '1000.000',
      reason: 'batch',
    });
    expect(Number(created.unitCost)).toBeCloseTo(101 / 2000);
    expect(
      (await transactionsOf('tomato')).map(({ quantity, unitCost }) => ({
        quantity,
        unitCost,
      })),
    ).toEqual([{ quantity: '-500.000', unitCost: null }]);
  });

  it('同一批的異動共用一個 productionBatchId，帳本原因為 batch', async () => {
    const created = await service.produceBatch(ORG, 'sauce', {
      quantity: '1000',
    });
    await service.produceBatch(ORG, 'sauce', { quantity: '500' });

    const rows = await db
      .select({ productionBatchId: inventoryTransaction.productionBatchId })
      .from(inventoryTransaction);
    const batchIds = new Set(
      rows.map(({ productionBatchId }) => productionBatchId),
    );

    expect(rows).toHaveLength(6);
    expect(batchIds.size).toBe(2);
    expect(created.productionBatchId).toEqual(expect.any(String));
    expect(
      rows.filter(
        ({ productionBatchId }) =>
          productionBatchId === created.productionBatchId,
      ),
    ).toHaveLength(3);

    const { data } = await service.findAll('tomato');
    expect(data.map(({ quantity, reason }) => ({ quantity, reason }))).toEqual([
      { quantity: '-250.000', reason: 'batch' },
      { quantity: '-500.000', reason: 'batch' },
    ]);
    expect(
      (await service.findAll('sauce', { quickFilterEnums: ['reason:batch'] }))
        .total,
    ).toBe(2);
  });

  it('無限庫存的原料不扣也不記異動', async () => {
    await service.produceBatch(ORG, 'sauce', { quantity: '2000' });

    expect(await levelOf('water')).toBe(0);
    expect(await transactionsOf('water')).toEqual([]);
  });

  it('原料不足時列出全部缺口且不寫入任何異動', async () => {
    await db
      .update(ingredient)
      .set({ inventoryLevel: '10' })
      .where(eq(ingredient.id, 'salt'));

    const response = await responseOf(
      service.produceBatch(ORG, 'sauce', { quantity: '4000' }),
    );

    expect(response.code).toBe('insufficientStock');
    expect(response.ingredients).toEqual([
      { id: 'salt', name: { 'zh-TW': '鹽' }, shortfall: '90.000' },
    ]);

    await db
      .update(ingredient)
      .set({ inventoryLevel: '1000' })
      .where(eq(ingredient.id, 'tomato'));
    const both = await responseOf(
      service.produceBatch(ORG, 'sauce', { quantity: '4000' }),
    );

    expect(both.ingredients).toEqual([
      { id: 'salt', name: { 'zh-TW': '鹽' }, shortfall: '90.000' },
      { id: 'tomato', name: { 'zh-TW': '番茄' }, shortfall: '1000.000' },
    ]);
    expect(await levelOf('sauce')).toBe(0);
    expect(await db.select().from(inventoryTransaction)).toEqual([]);
  });

  it('原料剛好用完時可以製作', async () => {
    await service.produceBatch(ORG, 'sauce', { quantity: '4000' });

    expect(await levelOf('tomato')).toBe(0);
    expect(await levelOf('salt')).toBe(0);
  });

  it('沒有來源食譜或食譜沒有產量時擋下', async () => {
    expect(
      (await responseOf(service.produceBatch(ORG, 'tomato', { quantity: '1' })))
        .code,
    ).toBe('sourceRecipeRequired');
    expect(
      (
        await responseOf(
          service.produceBatch(ORG, 'unsized', { quantity: '1' }),
        )
      ).code,
    ).toBe('sourceRecipeYieldMissing');
  });

  it('別店的食材視為找不到', async () => {
    expect(
      (
        await responseOf(
          service.produceBatch(OTHER_ORG, 'sauce', { quantity: '1' }),
        )
      ).code,
    ).toBe('ingredientNotFound');
    expect(await levelOf('tomato')).toBe(2000);
  });

  it('原料降到低庫存門檻時送出通知', async () => {
    const emit = vi.spyOn(eventEmitter, 'emit');

    await service.produceBatch(ORG, 'sauce', { quantity: '1000' });

    expect(emit).toHaveBeenCalledWith(LOW_STOCK_REACHED_EVENT, {
      organizationId: ORG,
      ingredients: [{ id: 'tomato', name: { 'zh-TW': '番茄' } }],
    });
  });

  it('沒有採購權限時不回傳進價', async () => {
    const created = await service.produceBatch(
      ORG,
      'sauce',
      { quantity: '1000' },
      false,
    );

    expect(created).not.toHaveProperty('unitCost');
  });
});
