import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import { inventoryTransaction } from '../db/schema/inventory.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { LOW_STOCK_REACHED_EVENT } from '../events/low-stock-reached.event.js';

import { InventoryTransactionsService } from './inventory-transactions.service.js';

const ORG = 'org';
const OTHER_ORG = 'other';
const LATTE = '00000000-0000-4000-8000-000000000001';
const OTHER_LATTE = '00000000-0000-4000-8000-000000000002';
const NO_RECIPE = '00000000-0000-4000-8000-000000000003';
const OAT = '00000000-0000-4000-8000-000000000011';
const OTHER_OAT = '00000000-0000-4000-8000-000000000012';

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

describe('依食譜登記成品報廢', () => {
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
    await client.exec(
      'truncate recipe, ingredient, menu, organization cascade',
    );
    for (const id of [ORG, OTHER_ORG])
      await client.exec(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('${id}', '${id}', '${id}', now(), 'TW', '桃園市', '大園區', '中正東路一段');
         insert into menu (id, organization_id, name) values ('${id}', '${id}', '{"zh-TW":"菜單"}');
         insert into modifier_group (id, menu_id, display_name) values ('${id}', '${id}', '{"zh-TW":"群組"}');`,
      );
    await client.exec(
      `insert into menu_item (id, menu_id, name) values
         ('${LATTE}', '${ORG}', '{"zh-TW":"拿鐵"}'),
         ('${NO_RECIPE}', '${ORG}', '{"zh-TW":"冰塊"}'),
         ('${OTHER_LATTE}', '${OTHER_ORG}', '{"zh-TW":"拿鐵"}');
       insert into modifier (id, modifier_group_id, display_name) values
         ('${OAT}', '${ORG}', '{"zh-TW":"燕麥奶"}'),
         ('${OTHER_OAT}', '${OTHER_ORG}', '{"zh-TW":"燕麥奶"}');
       insert into ingredient (id, organization_id, name, unit_code, inventory_level, low_stock_threshold, unlimited_stock, eligible_quantity, eligible_quantity_unit_code, price) values
         ('beans', '${ORG}', '{"zh-TW":"beans"}', 'GRM', 100, null, false, 1000, 'GRM', 1000),
         ('milk', '${ORG}', '{"zh-TW":"milk"}', 'GRM', 1000, 700, false, 1000, 'GRM', 1000),
         ('water', '${ORG}', '{"zh-TW":"water"}', 'GRM', 0, null, true, 1000, 'GRM', 1000);
       insert into recipe (id, organization_id, menu_item_id, name, recipe_yield) values
         ('latte', '${ORG}', '${LATTE}', '{"zh-TW":"拿鐵"}', 2);
       insert into recipe (id, organization_id, modifier_id, name) values
         ('oat', '${ORG}', '${OAT}', '{"zh-TW":"燕麥奶"}');
       insert into recipe_ingredient (id, recipe_id, ingredient_id, required_quantity) values
         ('latte-beans', 'latte', 'beans', 36),
         ('latte-milk', 'latte', 'milk', 400),
         ('latte-water', 'latte', 'water', 60),
         ('oat-milk', 'oat', 'milk', 50);`,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const levels = async () =>
    Object.fromEntries(
      (
        await client.query<{ id: string; inventory_level: string }>(
          `select id, inventory_level from ingredient order by id`,
        )
      ).rows.map(({ id, inventory_level }) => [id, Number(inventory_level)]),
    );

  it('依品項與選項的食譜展開，每種食材記一筆同批次的報廢異動', async () => {
    const created = await service.wasteProduct(ORG, {
      menuItemId: LATTE,
      modifierIds: [OAT],
      note: '做錯',
      servings: 2,
      wasteReason: 'madeWrong',
    });

    expect(await levels()).toEqual({ beans: 64, milk: 500, water: 0 });
    expect(
      created
        .map(({ balance, ingredientId, quantity, unitCost }) => ({
          balance,
          ingredientId,
          quantity,
          unitCost: Number(unitCost),
        }))
        .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId)),
    ).toEqual([
      {
        balance: '64.000',
        ingredientId: 'beans',
        quantity: '-36.000',
        unitCost: 1,
      },
      {
        balance: '500.000',
        ingredientId: 'milk',
        quantity: '-500.000',
        unitCost: 1,
      },
    ]);
    expect(new Set(created.map(({ wasteBatchId }) => wasteBatchId)).size).toBe(
      1,
    );
    for (const row of created)
      expect(row).toMatchObject({
        note: '做錯',
        orderId: null,
        organizationId: ORG,
        productionBatchId: null,
        reason: 'waste',
        wasteBatchId: expect.any(String),
        wasteMenuItemId: LATTE,
        wasteReason: 'madeWrong',
        wasteServings: 2,
      });
  });

  it('其他店的品項回 menuItemNotFound', async () => {
    expect(
      (
        await responseOf(
          service.wasteProduct(ORG, {
            menuItemId: OTHER_LATTE,
            servings: 1,
            wasteReason: 'spilled',
          }),
        )
      ).code,
    ).toBe('menuItemNotFound');
  });

  it('其他店的選項回 modifierNotFound', async () => {
    expect(
      (
        await responseOf(
          service.wasteProduct(ORG, {
            menuItemId: LATTE,
            modifierIds: [OAT, OTHER_OAT],
            servings: 1,
            wasteReason: 'spilled',
          }),
        )
      ).code,
    ).toBe('modifierNotFound');
  });

  it('品項沒有食譜時以 wasteRecipeMissing 擋下', async () => {
    expect(
      (
        await responseOf(
          service.wasteProduct(ORG, {
            menuItemId: NO_RECIPE,
            servings: 1,
            wasteReason: 'other',
          }),
        )
      ).code,
    ).toBe('wasteRecipeMissing');
  });

  it('展開的用量超過帳上數量時列出短缺食材且不寫入異動', async () => {
    const response = await responseOf(
      service.wasteProduct(ORG, {
        menuItemId: LATTE,
        servings: 6,
        wasteReason: 'expired',
      }),
    );

    expect(response.code).toBe('wasteExceedsStock');
    expect(response.ingredients).toEqual([
      { id: 'beans', name: { 'zh-TW': 'beans' }, shortfall: '8.000' },
      { id: 'milk', name: { 'zh-TW': 'milk' }, shortfall: '200.000' },
    ]);
    expect(await levels()).toEqual({ beans: 100, milk: 1000, water: 0 });
    expect(await db.select().from(inventoryTransaction)).toEqual([]);
  });

  it('降到低庫存門檻時送出通知', async () => {
    const emit = vi.spyOn(eventEmitter, 'emit');

    await service.wasteProduct(ORG, {
      menuItemId: LATTE,
      servings: 2,
      wasteReason: 'spilled',
    });

    expect(emit).toHaveBeenCalledWith(LOW_STOCK_REACHED_EVENT, {
      organizationId: ORG,
      ingredients: [{ id: 'milk', name: { 'zh-TW': 'milk' } }],
    });
  });

  it('沒有採購權限時不回傳進價', async () => {
    const created = await service.wasteProduct(
      ORG,
      { menuItemId: LATTE, servings: 1, wasteReason: 'other' },
      false,
    );

    for (const row of created) expect(row).not.toHaveProperty('unitCost');
  });
});
