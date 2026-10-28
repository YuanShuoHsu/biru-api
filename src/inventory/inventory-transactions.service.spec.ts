import { EventEmitter2 } from '@nestjs/event-emitter';

import { PGlite } from '@electric-sql/pglite';
import { createPGlite } from '../../test/pglite.js';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';
import { offer } from '../db/schema/menus.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { MENU_UPDATED_EVENT } from '../events/menu-updated.event.js';

import {
  InsufficientStockError,
  InventoryTransactionsService,
} from './inventory-transactions.service.js';
import { MenuStockService, keepAutoSoldOut } from './menu-stock.service.js';

const ORG = 'org';

describe('庫存扣除、還原與自動售完', () => {
  let client: PGlite;
  let db: DrizzleDB;
  let service: InventoryTransactionsService;
  let menuStock: MenuStockService;
  let eventEmitter: EventEmitter2;

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as DrizzleDB;
    service = new InventoryTransactionsService(db);
    eventEmitter = new EventEmitter2();
    menuStock = new MenuStockService(db, eventEmitter);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      'truncate "order", recipe, ingredient, menu, organization cascade',
    );
    await client.exec(
      `insert into organization (id, name, slug, created_at) values ('${ORG}', 'biru', 'biru', now());
       insert into menu (id, organization_id, name) values ('menu', '${ORG}', '{"zh-TW":"菜單"}');`,
    );
  });

  const addItem = async (
    id: string,
    {
      autoSoldOut = false,
      availability = 'InStock',
      remaining,
    }: {
      autoSoldOut?: boolean;
      availability?: 'InStock' | 'SoldOut';
      remaining?: number | null;
    } = {},
  ) => {
    await client.query(
      `insert into menu_item (id, menu_id, name) values ($1, 'menu', $2)`,
      [id, JSON.stringify({ 'zh-TW': id })],
    );
    await client.query(
      `insert into offer (id, menu_item_id, price, availability, auto_sold_out, inventory_level)
       values ($1, $2, 100, $3, $4, $5)`,
      [
        `${id}-offer`,
        id,
        availability,
        autoSoldOut,
        remaining === undefined ? null : JSON.stringify({ value: remaining }),
      ],
    );
  };

  const addIngredient = (
    id: string,
    inventoryLevel: string,
    lowStockThreshold: string | null = null,
  ) =>
    client.query(
      `insert into ingredient (id, organization_id, name, unit_code, inventory_level, low_stock_threshold)
       values ($1, $2, $3, 'MLT', $4, $5)`,
      [
        id,
        ORG,
        JSON.stringify({ 'zh-TW': id }),
        inventoryLevel,
        lowStockThreshold,
      ],
    );

  const addRecipe = async (
    menuItemId: string,
    materials: Record<string, string>,
    recipeYield = 1,
  ) => {
    await client.query(
      `insert into recipe (id, organization_id, menu_item_id, name, recipe_yield)
       values ($1, $2, $3, '{"zh-TW":"食譜"}', $4)`,
      [`${menuItemId}-recipe`, ORG, menuItemId, recipeYield],
    );
    for (const [ingredientId, requiredQuantity] of Object.entries(materials))
      await client.query(
        `insert into recipe_ingredient (id, recipe_id, ingredient_id, required_quantity)
         values ($1, $2, $3, $4)`,
        [
          `${menuItemId}-${ingredientId}`,
          `${menuItemId}-recipe`,
          ingredientId,
          requiredQuantity,
        ],
      );
  };

  const addOrder = async (
    id: string,
    items: { menuItemId: string; quantity: number; addOns?: string[] }[],
  ) => {
    await client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal)
       values ($1, '{"name":"客人"}', 'pickup', '1', 'Cash', $2, 100)`,
      [id, ORG],
    );
    for (const [
      index,
      { addOns = [], menuItemId, quantity },
    ] of items.entries())
      await client.query(
        `insert into order_item (id, order_id, menu_item_id, menu_item_name, order_quantity, unit_price, add_ons)
         values ($1, $2, $3, $3, $4, 100, $5)`,
        [
          `${id}-${index}`,
          id,
          menuItemId,
          quantity,
          JSON.stringify(
            addOns.map((addOnId) => ({
              menuItemId: addOnId,
              menuItemName: addOnId,
              modifiers: [],
              unitPrice: '10',
            })),
          ),
        ],
      );
  };

  const remainingOf = async (menuItemId: string) => {
    const {
      rows: [row],
    } = await client.query<{ inventory_level: { value?: number } | null }>(
      `select inventory_level from offer where menu_item_id = $1`,
      [menuItemId],
    );
    return row.inventory_level?.value;
  };

  const availabilityOf = async (menuItemId: string) => {
    const {
      rows: [row],
    } = await client.query<{ availability: string; auto_sold_out: boolean }>(
      `select availability, auto_sold_out from offer where menu_item_id = $1`,
      [menuItemId],
    );
    return row;
  };

  const levelOf = async (ingredientId: string) => {
    const {
      rows: [row],
    } = await client.query<{ inventory_level: string }>(
      `select inventory_level from ingredient where id = $1`,
      [ingredientId],
    );
    return Number(row.inventory_level);
  };

  const consume = (orderId: string, enforceStock = false) =>
    db.transaction((tx) => service.consume(orderId, tx, { enforceStock }));

  const restore = (orderId: string) =>
    db.transaction((tx) => service.restoreAll(orderId, tx));

  describe('定價的剩餘數量', () => {
    it('下單扣掉主品項與加購的份數，取消後照扣掉的份數還回去', async () => {
      await addItem('cake', { remaining: 5 });
      await addItem('cream', { remaining: 3 });
      await addOrder('o1', [
        { menuItemId: 'cake', quantity: 2, addOns: ['cream'] },
      ]);

      const { offerStockChanged } = await consume('o1', true);

      expect(offerStockChanged).toBe(true);
      expect(await remainingOf('cake')).toBe(3);
      expect(await remainingOf('cream')).toBe(1);

      await expect(restore('o1')).resolves.toBe(true);
      expect(await remainingOf('cake')).toBe(5);
      expect(await remainingOf('cream')).toBe(3);
    });

    it('同一筆訂單還原兩次只會還一次', async () => {
      await addItem('cake', { remaining: 5 });
      await addOrder('o1', [{ menuItemId: 'cake', quantity: 2 }]);
      await consume('o1', true);

      await restore('o1');
      await expect(restore('o1')).resolves.toBe(false);

      expect(await remainingOf('cake')).toBe(5);
    });

    it('剩餘數量不夠時建單會被擋下，數量不變', async () => {
      await addItem('cake', { remaining: 1 });
      await addOrder('o1', [{ menuItemId: 'cake', quantity: 2 }]);

      await expect(consume('o1', true)).rejects.toEqual(
        new InsufficientStockError('cake'),
      );
      expect(await remainingOf('cake')).toBe(1);
    });

    it('不檢查時（已付款的異常單補回）最多扣到 0，還原時只還實際扣掉的份數', async () => {
      await addItem('cake', { remaining: 1 });
      await addOrder('o1', [{ menuItemId: 'cake', quantity: 3 }]);

      await consume('o1');
      expect(await remainingOf('cake')).toBe(0);

      await restore('o1');
      expect(await remainingOf('cake')).toBe(1);
    });

    it('不限量的品項不扣也不記', async () => {
      await addItem('latte', { remaining: null });
      await addOrder('o1', [{ menuItemId: 'latte', quantity: 2 }]);

      const { offerStockChanged } = await consume('o1', true);

      expect(offerStockChanged).toBe(false);
      expect(await remainingOf('latte')).toBeNull();
    });
  });

  describe('食材', () => {
    it('只回傳這次從高於門檻跌到門檻以下的食材', async () => {
      await addItem('latte');
      await addIngredient('crossed', '10.200', '10');
      await addIngredient('alreadyAtThreshold', '10.000', '10');
      await addIngredient('stillAbove', '20.000', '10');
      await addIngredient('noThreshold', '0.200');
      await addRecipe(
        'latte',
        {
          alreadyAtThreshold: '1',
          crossed: '1',
          noThreshold: '1',
          stillAbove: '1',
        },
        3,
      );
      await addOrder('o1', [{ menuItemId: 'latte', quantity: 1 }]);

      const { lowStock } = await consume('o1');

      expect(lowStock).toEqual([
        { id: 'crossed', name: { 'zh-TW': 'crossed' } },
      ]);
      expect(await levelOf('noThreshold')).toBeCloseTo(-0.133, 3);
    });

    it('多個品項共用的食材合計不夠時建單會被擋下，食材不變', async () => {
      await addItem('latte');
      await addItem('cappuccino');
      await addIngredient('milk', '300');
      await addRecipe('latte', { milk: '200' });
      await addRecipe('cappuccino', { milk: '150' });
      await addOrder('o1', [
        { menuItemId: 'latte', quantity: 1 },
        { menuItemId: 'cappuccino', quantity: 1 },
      ]);

      await expect(consume('o1', true)).rejects.toBeInstanceOf(
        InsufficientStockError,
      );
      expect(await levelOf('milk')).toBe(300);
    });

    it('用量四捨五入到小數第三位的最後一份仍然賣得出去', async () => {
      await addItem('latte');
      await addIngredient('beans', '0.333');
      await addRecipe('latte', { beans: '1' }, 3);
      await addOrder('o1', [{ menuItemId: 'latte', quantity: 1 }]);

      await expect(consume('o1', true)).resolves.toBeDefined();
    });
  });

  describe('MenuStockService.sync', () => {
    it('食材不夠一份或剩餘數量為 0 時自動售完', async () => {
      await addItem('latte');
      await addItem('cake', { remaining: 0 });
      await addItem('tea');
      await addIngredient('milk', '100');
      await addRecipe('latte', { milk: '200' });

      await expect(menuStock.sync(ORG)).resolves.toBe(true);

      expect(await availabilityOf('latte')).toEqual({
        auto_sold_out: true,
        availability: 'SoldOut',
      });
      expect(await availabilityOf('cake')).toEqual({
        auto_sold_out: true,
        availability: 'SoldOut',
      });
      expect(await availabilityOf('tea')).toEqual({
        auto_sold_out: false,
        availability: 'InStock',
      });
    });

    it('補貨後只恢復系統自動售完的，店員手動售完的不動', async () => {
      await addItem('latte', { autoSoldOut: true, availability: 'SoldOut' });
      await addItem('mocha', { availability: 'SoldOut' });
      await addIngredient('milk', '1000');
      await addRecipe('latte', { milk: '200' });
      await addRecipe('mocha', { milk: '200' });

      await menuStock.sync(ORG);

      expect(await availabilityOf('latte')).toEqual({
        auto_sold_out: false,
        availability: 'InStock',
      });
      expect(await availabilityOf('mocha')).toEqual({
        auto_sold_out: false,
        availability: 'SoldOut',
      });
    });

    it('狀態沒變時不改資料也不通知', async () => {
      await addItem('latte');
      await addIngredient('milk', '1000');
      await addRecipe('latte', { milk: '200' });
      const emit = vi.spyOn(eventEmitter, 'emit');

      await menuStock.refresh(ORG);

      expect(emit).not.toHaveBeenCalled();
      emit.mockRestore();
    });

    it('有變動時通知前台重新載入菜單', async () => {
      await addItem('cake', { remaining: 0 });
      const emit = vi.spyOn(eventEmitter, 'emit');

      await menuStock.refresh(ORG);

      expect(emit).toHaveBeenCalledWith(MENU_UPDATED_EVENT, {
        organizationId: ORG,
      });
      emit.mockRestore();
    });

    it('剩餘數量不到一份也算售完', async () => {
      await addItem('cake', { remaining: 0.5 });

      await menuStock.sync(ORG);

      expect(await availabilityOf('cake')).toEqual({
        auto_sold_out: true,
        availability: 'SoldOut',
      });
    });

    it('賣到剩餘數量為 0 後自動售完，取消訂單還回來後自動恢復', async () => {
      await addItem('cake', { remaining: 1 });
      await addOrder('o1', [{ menuItemId: 'cake', quantity: 1 }]);

      await consume('o1', true);
      await menuStock.sync(ORG);
      expect(await availabilityOf('cake')).toEqual({
        auto_sold_out: true,
        availability: 'SoldOut',
      });

      await restore('o1');
      await menuStock.sync(ORG);
      expect(await availabilityOf('cake')).toEqual({
        auto_sold_out: false,
        availability: 'InStock',
      });
    });
  });

  describe('keepAutoSoldOut', () => {
    const save = (availability?: 'InStock' | 'SoldOut') =>
      db
        .update(offer)
        .set({
          ...(availability && { availability }),
          ...keepAutoSoldOut(availability),
          price: '120',
        })
        .where(eq(offer.menuItemId, 'cake'));

    beforeEach(async () => {
      await addItem('cake', { autoSoldOut: true, availability: 'SoldOut' });
    });

    it('送出與目前相同的供應狀態時保留自動售完', async () => {
      await save('SoldOut');

      expect(await availabilityOf('cake')).toEqual({
        auto_sold_out: true,
        availability: 'SoldOut',
      });
    });

    it('店員改了供應狀態就不再算自動售完', async () => {
      await save('InStock');

      expect(await availabilityOf('cake')).toEqual({
        auto_sold_out: false,
        availability: 'InStock',
      });
    });

    it('沒有送供應狀態時不動', async () => {
      await save();

      expect(await availabilityOf('cake')).toEqual({
        auto_sold_out: true,
        availability: 'SoldOut',
      });
    });
  });

  it('批次還原前依 id 順序鎖住所有訂單扣過的定價', async () => {
    await addItem('cake', { remaining: 5 });
    await addItem('cream', { remaining: 5 });
    await addOrder('o1', [{ menuItemId: 'cream', quantity: 1 }]);
    await addOrder('o2', [{ menuItemId: 'cake', quantity: 1 }]);
    await consume('o1', true);
    await consume('o2', true);

    await db.transaction(async (tx) => {
      await service.lockHeldOfferStock(['o1', 'o2'], tx);
      await service.restoreAll('o1', tx);
      await service.restoreAll('o2', tx);
    });

    expect(await remainingOf('cake')).toBe(5);
    expect(await remainingOf('cream')).toBe(5);
  });
});
