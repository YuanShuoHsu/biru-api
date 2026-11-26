import { EventEmitter2 } from '@nestjs/event-emitter';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type {
  CupSeal,
  CupSize,
  ServingTemperatureLevel,
} from '../db/schema/enums.js';
import type {
  OrderItemModifierSnapshot,
  OrderMode,
} from '../db/schema/orders.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import {
  InsufficientStockError,
  InventoryTransactionsService,
} from './inventory-transactions.service.js';

const ORG = 'org';

describe('外帶杯材依冷熱、容量與封口扣庫存', () => {
  let client: PGlite;
  let db: DrizzleDB;
  let service: InventoryTransactionsService;

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as DrizzleDB;
    service = new InventoryTransactionsService(db, new EventEmitter2());
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      'truncate "order", recipe, ingredient, menu, organization cascade',
    );
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('${ORG}', 'biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into menu (id, organization_id, name) values ('menu', '${ORG}', '{"zh-TW":"菜單"}');
       insert into menu_item (id, menu_id, name) values ('latte', 'menu', '{"zh-TW":"拿鐵"}'), ('tea', 'menu', '{"zh-TW":"紅茶"}');`,
    );
    for (const [id, level] of [
      ['hot-cup', '100'],
      ['hot-lid', '100'],
      ['cold-cup-16', '100'],
      ['plastic-film', '100'],
    ])
      await client.query(
        `insert into ingredient (id, organization_id, name, unit_code, inventory_level)
         values ($1, $2, $3, 'H87', $4)`,
        [id, ORG, JSON.stringify({ 'zh-TW': id }), level],
      );
    await addPackaging('Hot', '12oz', 'lid', ['hot-cup', 'hot-lid']);
    await addPackaging('Iced', '16oz', 'film', ['cold-cup-16', 'plastic-film']);
  });

  const addPackaging = async (
    servingTemperature: 'Hot' | 'Iced',
    cupSize: CupSize,
    cupSeal: CupSeal,
    ingredientIds: string[],
  ) => {
    const recipeId = `${servingTemperature}-${cupSize}-${cupSeal}`;
    await client.query(
      `insert into recipe (id, organization_id, name) values ($1, $2, '{"zh-TW":"包材"}')`,
      [recipeId, ORG],
    );
    for (const ingredientId of ingredientIds)
      await client.query(
        `insert into recipe_ingredient (id, recipe_id, ingredient_id, required_quantity)
         values ($1, $2, $3, 1)`,
        [`${recipeId}-${ingredientId}`, recipeId, ingredientId],
      );
    await client.query(
      `insert into takeaway_packaging (id, organization_id, serving_temperature, cup_size, cup_seal, recipe_id)
       values ($1, $2, $3, $4, $5, $1)`,
      [recipeId, ORG, servingTemperature, cupSize, cupSeal],
    );
  };

  const option = (
    modifierId: string,
    extra: Partial<OrderItemModifierSnapshot> = {},
  ): OrderItemModifierSnapshot => ({
    modifierGroupId: 'group',
    modifierGroupName: '群組',
    modifierId,
    modifierName: modifierId,
    priceAdjustment: null,
    ...extra,
  });

  const lid = option('lid', { cupSeal: 'lid' });
  const film = option('film', { cupSeal: 'film' });
  const large = option('large', { cupSize: '16oz' });
  const ownCup = option('own-cup', { customerProvidedCup: true });

  const addOrder = async (
    id: string,
    mode: OrderMode,
    items: {
      menuItemId?: string;
      quantity: number;
      servingTemperatureLevel: ServingTemperatureLevel | null;
      modifiers: OrderItemModifierSnapshot[];
      addOns?: object[];
    }[],
  ) => {
    await client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal)
       values ($1, '{"name":"客人"}', $2, '1', 'Cash', $3, 100)`,
      [id, mode, ORG],
    );
    for (const [index, item] of items.entries())
      await client.query(
        `insert into order_item (id, order_id, menu_item_id, menu_item_name, order_quantity, unit_price, add_ons, modifiers, serving_temperature_level)
         values ($1, $2, $3, $3, $4, 100, $5, $6, $7)`,
        [
          `${id}-${index}`,
          id,
          item.menuItemId ?? 'latte',
          item.quantity,
          JSON.stringify(item.addOns ?? []),
          JSON.stringify(item.modifiers),
          item.servingTemperatureLevel,
        ],
      );
  };

  const levels = async () => {
    const { rows } = await client.query<{
      id: string;
      inventory_level: string;
    }>(`select id, inventory_level from ingredient order by id`);
    return Object.fromEntries(
      rows.map(({ id, inventory_level }) => [id, Number(inventory_level)]),
    );
  };

  const consume = (orderId: string, enforceStock = true) =>
    db.transaction((tx) => service.consume(orderId, tx, { enforceStock }));

  const restore = (orderId: string) =>
    db.transaction((tx) => service.restoreAll(orderId, tx));

  it('外帶熱飲選杯蓋扣熱飲杯與杯蓋，份數為品項數量', async () => {
    await addOrder('o1', 'counter', [
      { quantity: 2, servingTemperatureLevel: 'Warm', modifiers: [lid] },
    ]);

    await consume('o1');

    expect(await levels()).toEqual({
      'cold-cup-16': 100,
      'hot-cup': 98,
      'hot-lid': 98,
      'plastic-film': 100,
    });
  });

  it('同一張單用到同一份包材食譜的份數會加總', async () => {
    await client.query(
      `insert into takeaway_packaging (id, organization_id, serving_temperature, cup_size, cup_seal, recipe_id)
       values ('iced-lid', $1, 'Iced', '12oz', 'lid', 'Hot-12oz-lid')`,
      [ORG],
    );
    await addOrder('o1', 'counter', [
      { quantity: 2, servingTemperatureLevel: 'Hot', modifiers: [lid] },
      {
        menuItemId: 'tea',
        quantity: 1,
        servingTemperatureLevel: 'Warm',
        modifiers: [lid],
      },
      { quantity: 3, servingTemperatureLevel: 'NoIce', modifiers: [lid] },
    ]);

    await consume('o1');

    expect(await levels()).toMatchObject({ 'hot-cup': 94, 'hot-lid': 94 });
  });

  it('外帶冷飲選大杯與封膜扣 16oz 冷飲杯與膠膜，取消後還回去', async () => {
    await addOrder('o1', 'pickup', [
      {
        quantity: 3,
        servingTemperatureLevel: 'LessIce',
        modifiers: [large, film],
      },
    ]);

    await consume('o1');

    expect(await levels()).toMatchObject({
      'cold-cup-16': 97,
      'plastic-film': 97,
    });

    await restore('o1');

    expect(await levels()).toMatchObject({
      'cold-cup-16': 100,
      'plastic-film': 100,
    });
  });

  it('加購的飲品依自己的冷熱與選項另扣一份杯材', async () => {
    await addOrder('o1', 'counter', [
      {
        quantity: 1,
        servingTemperatureLevel: 'Hot',
        modifiers: [lid],
        addOns: [
          {
            menuItemId: 'tea',
            menuItemName: '紅茶',
            modifiers: [large, film],
            servingTemperatureLevel: 'RegularIce',
            unitPrice: '10',
          },
          {
            menuItemId: 'tea',
            menuItemName: '紅茶',
            modifiers: [],
            unitPrice: '10',
          },
        ],
      },
    ]);

    await consume('o1');

    expect(await levels()).toEqual({
      'cold-cup-16': 99,
      'hot-cup': 99,
      'hot-lid': 99,
      'plastic-film': 99,
    });
  });

  it('自備環保杯、內用、沒有選封口或沒有冷熱的品項不扣', async () => {
    await addOrder('o1', 'counter', [
      {
        quantity: 1,
        servingTemperatureLevel: 'Hot',
        modifiers: [lid, ownCup],
      },
      { quantity: 1, servingTemperatureLevel: 'Hot', modifiers: [] },
      { quantity: 1, servingTemperatureLevel: null, modifiers: [lid] },
    ]);
    await addOrder('o2', 'dineIn', [
      { quantity: 1, servingTemperatureLevel: 'Hot', modifiers: [lid] },
    ]);

    await consume('o1');
    await consume('o2');

    expect(Object.values(await levels())).toEqual([100, 100, 100, 100]);
  });

  it('沒有對應的包材設定時不扣也不擋單', async () => {
    await addOrder('o1', 'counter', [
      { quantity: 1, servingTemperatureLevel: 'Hot', modifiers: [film] },
      { quantity: 1, servingTemperatureLevel: 'NoIce', modifiers: [lid] },
    ]);

    await expect(consume('o1')).resolves.toBeDefined();
    expect(Object.values(await levels())).toEqual([100, 100, 100, 100]);
  });

  it('杯材不夠時建單會被擋下並指出用到它的品項，已付款補扣則超賣', async () => {
    await client.exec(
      `update ingredient set inventory_level = 1 where id = 'hot-lid'`,
    );
    await addOrder('o1', 'counter', [
      {
        menuItemId: 'tea',
        quantity: 2,
        servingTemperatureLevel: 'Hot',
        modifiers: [lid],
      },
    ]);

    await expect(consume('o1')).rejects.toEqual(
      new InsufficientStockError({ menuItemId: 'tea' }),
    );
    expect((await levels())['hot-lid']).toBe(1);

    const { lowStock } = await consume('o1', false);

    expect((await levels())['hot-lid']).toBe(-1);
    expect(lowStock).toEqual([expect.objectContaining({ oversold: true })]);
  });

  it('不限量的杯材不扣', async () => {
    await client.exec(
      `update ingredient set unlimited_stock = true where id = 'hot-lid'`,
    );
    await addOrder('o1', 'counter', [
      { quantity: 1, servingTemperatureLevel: 'Hot', modifiers: [lid] },
    ]);

    await consume('o1');

    expect(await levels()).toMatchObject({ 'hot-cup': 99, 'hot-lid': 100 });
  });
});
