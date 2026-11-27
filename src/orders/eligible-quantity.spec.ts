import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import { menu, menuItem, offer } from '../db/schema/menus.js';
import {
  order,
  orderItem,
  type OrderItemAddOnSnapshot,
  type OrderStatus,
} from '../db/schema/orders.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { businessDayStart } from '../inventory/offer-daily-limit.js';

import { purchasedToday } from './eligible-quantity.js';
import {
  OrderPricingService,
  type ResolvedOrderItem,
} from './order-pricing.service.js';

const latteAddOn: OrderItemAddOnSnapshot = {
  menuItemId: 'latte',
  menuItemName: '拿鐵',
  unitPrice: '100',
  modifiers: [],
};

describe('限購的會員今日已買', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let sequence = 0;

  const placeOrder = async (
    menuItemId: string,
    orderQuantity: number,
    {
      addOns = [],
      createdAt = new Date(),
      orderStatus = 'OrderProcessing',
      sellerId = 'org',
      userId = 'me',
    }: {
      addOns?: OrderItemAddOnSnapshot[];
      createdAt?: Date;
      orderStatus?: OrderStatus;
      sellerId?: string;
      userId?: string;
    } = {},
  ) => {
    const id = `order-${++sequence}`;
    await db.insert(order).values({
      id,
      createdAt,
      customer: { name: userId },
      mode: 'pickup',
      orderNumber: id,
      orderStatus,
      paymentMethod: 'Credit',
      sellerId,
      subtotal: '100',
      userId,
    });
    await db.insert(orderItem).values({
      id: `${id}-item`,
      addOns,
      menuItemId,
      menuItemName: menuItemId,
      orderId: id,
      orderQuantity,
      unitPrice: '100',
    });
  };

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });

    for (const id of ['org', 'other'])
      await client.query(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, $1, $1, now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
        [id],
      );
    for (const id of ['me', 'someone'])
      await client.query(
        `insert into "user" (id, name, email, first_name) values ($1, $1, $1 || '@example.com', $1)`,
        [id],
      );
    await db
      .insert(menu)
      .values({ id: 'menu', organizationId: 'org', name: { 'zh-TW': '菜單' } });
    await db.insert(menuItem).values([
      { id: 'latte', menuId: 'menu', name: { 'zh-TW': '拿鐵' } },
      { id: 'cookie', menuId: 'menu', name: { 'zh-TW': '餅乾' } },
    ]);
    await db.insert(offer).values([
      {
        id: 'offer-latte',
        dailyLimit: 10,
        eligibleQuantity: { maxValue: 4 },
        menuItemId: 'latte',
        price: '100',
      },
      { id: 'offer-cookie', menuItemId: 'cookie', price: '30' },
    ]);

    await placeOrder('latte', 1);
    await placeOrder('cookie', 2, { addOns: [latteAddOn] });
    await placeOrder('latte', 1, { orderStatus: 'OrderPaymentDue' });
    await placeOrder('latte', 5, { orderStatus: 'OrderCancelled' });
    await placeOrder('latte', 5, { orderStatus: 'OrderReturned' });
    await placeOrder('latte', 5, { userId: 'someone' });
    await placeOrder('latte', 5, { sellerId: 'other' });
    await placeOrder('latte', 5, {
      createdAt: new Date(businessDayStart(Date.now()).getTime() - 60_000),
    });
  });

  afterAll(async () => {
    await client.close();
  });

  it('只算自己在這間門市今天成立的訂單，加購品照品項數量計，不含取消與全額退款', async () => {
    await expect(
      purchasedToday(db as unknown as DrizzleDB, 'org', 'me', [
        'latte',
        'cookie',
      ]),
    ).resolves.toEqual(
      new Map([
        ['latte', 4],
        ['cookie', 2],
      ]),
    );
  });

  it('下單交易內以今日已買重新檢查，已買滿就擋下', async () => {
    const service = new OrderPricingService(db as unknown as DrizzleDB);
    const line = (
      menuItemId: string,
      orderQuantity = 1,
    ): ResolvedOrderItem => ({
      addOns: [],
      cupSeal: null,
      id: menuItemId,
      leadTimeMinutes: 0,
      menuItemId,
      menuItemName: menuItemId,
      menuSectionIds: [],
      modifiers: [],
      orderQuantity,
      priceCurrency: 'TWD',
      servingTemperatureLevel: null,
      sweetnessLevel: null,
      unitPrice: '100',
    });

    await expect(
      service.assertMemberEligibleQuantities(
        db as unknown as DrizzleDB,
        'org',
        [line('latte')],
        'me',
      ),
    ).rejects.toMatchObject({
      response: { code: 'memberEligibleQuantityExceeded' },
    });
    await expect(
      service.assertMemberEligibleQuantities(
        db as unknown as DrizzleDB,
        'org',
        [line('latte', 4)],
        'newcomer',
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.assertMemberEligibleQuantities(
        db as unknown as DrizzleDB,
        'org',
        [line('cookie', 9)],
        'me',
      ),
    ).resolves.toBeUndefined();
  });
});
