import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import {
  type ItemAvailability,
  menu,
  menuItem,
  menuItemAddOn,
  menuItemModifierGroup,
  modifier,
  modifierGroup,
  offer,
} from '../db/schema/menus.js';
import {
  order,
  orderItem,
  type OrderItemAddOnSnapshot,
  type OrderItemModifierSnapshot,
  type OrderStatus,
} from '../db/schema/orders.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { FrequentItemsService } from './frequent-items.service.js';
import { OrderPricingService } from './order-pricing.service.js';

const DAY = 24 * 60 * 60 * 1000;

const oat: OrderItemModifierSnapshot = {
  modifierGroupId: 'milk',
  modifierGroupName: '奶',
  modifierId: 'oat',
  modifierName: '燕麥奶',
  priceAdjustment: '10',
};
const soy: OrderItemModifierSnapshot = {
  ...oat,
  modifierId: 'soy',
  modifierName: '豆漿',
};
const cookieAddOn: OrderItemAddOnSnapshot = {
  menuItemId: 'cookie',
  menuItemName: '餅乾',
  unitPrice: '30',
  modifiers: [],
};

interface LineInput {
  addOns?: OrderItemAddOnSnapshot[];
  menuItemId: string;
  modifiers?: OrderItemModifierSnapshot[];
  servingTemperatureLevel?: 'Hot' | 'LessIce';
  sweetnessLevel?: 'HalfSugar' | 'NoSugar';
}

describe('FrequentItemsService.findForUser', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: FrequentItemsService;
  let sequence = 0;

  const placeOrder = async (
    lines: (string | LineInput)[],
    {
      daysAgo = 1,
      orderStatus = 'OrderDelivered',
      sellerId = 'org',
      userId = 'me',
    }: {
      daysAgo?: number;
      orderStatus?: OrderStatus;
      sellerId?: string;
      userId?: string;
    } = {},
  ) => {
    const id = `order-${++sequence}`;
    const createdAt = new Date(Date.now() - daysAgo * DAY);
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
    await db.insert(orderItem).values(
      lines.map((line, index) => {
        const input = typeof line === 'string' ? { menuItemId: line } : line;
        return {
          id: `${id}-${index}`,
          addOns: input.addOns ?? [],
          createdAt,
          menuItemId: input.menuItemId,
          menuItemName: input.menuItemId,
          modifiers: input.modifiers ?? [],
          orderId: id,
          orderQuantity: 1,
          servingTemperatureLevel: input.servingTemperatureLevel ?? null,
          sweetnessLevel: input.sweetnessLevel ?? null,
          unitPrice: '100',
        };
      }),
    );
  };

  const find = (limit = 12, organizationSlug = 'biru') =>
    service.findForUser('me', { organizationSlug, mode: 'pickup', limit });

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new FrequentItemsService(
      db as unknown as DrizzleDB,
      new OrderPricingService(db as unknown as DrizzleDB),
    );

    for (const [id, slug] of [
      ['org', 'biru'],
      ['other', 'other'],
    ])
      await client.query(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, $1, $2, now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
        [id, slug],
      );
    for (const id of ['me', 'someone'])
      await client.query(
        `insert into "user" (id, name, email, first_name) values ($1, $1, $1 || '@example.com', $1)`,
        [id],
      );

    await db.insert(menu).values([
      { id: 'menu', organizationId: 'org', name: { 'zh-TW': '菜單' } },
      { id: 'otherMenu', organizationId: 'other', name: { 'zh-TW': '菜單' } },
    ]);
    const availabilityOf: Record<string, ItemAvailability> = {
      muffin: 'SoldOut',
      scone: 'Discontinued',
    };
    const items = [
      {
        id: 'latte',
        servingTemperatures: ['Iced', 'Hot'] as ('Iced' | 'Hot')[],
        sweetness: 'Adjustable' as const,
      },
      { id: 'tea' },
      { id: 'cookie' },
      { id: 'muffin' },
      { id: 'scone' },
      { id: 'bagel', availableModes: ['dineIn' as const] },
      { id: 'otherLatte', menuId: 'otherMenu' },
    ];
    await db.insert(menuItem).values(
      items.map((item) => ({
        menuId: 'menu',
        name: { 'zh-TW': item.id },
        ...item,
      })),
    );
    await db.insert(offer).values(
      items.map(({ id }) => ({
        id: `offer-${id}`,
        availability: availabilityOf[id] ?? 'InStock',
        menuItemId: id,
        price: '100',
      })),
    );
    await db.insert(menuItemAddOn).values({
      id: 'latte-cookie',
      menuItemId: 'latte',
      addOnMenuItemId: 'cookie',
    });
    await db.insert(modifierGroup).values({
      id: 'milk',
      menuId: 'menu',
      displayName: { 'zh-TW': '奶' },
    });
    await db.insert(menuItemModifierGroup).values({
      id: 'latte-milk',
      menuItemId: 'latte',
      modifierGroupId: 'milk',
    });
    await db.insert(modifier).values([
      {
        id: 'oat',
        modifierGroupId: 'milk',
        displayName: { 'zh-TW': '燕麥奶' },
      },
      {
        id: 'soy',
        modifierGroupId: 'milk',
        displayName: { 'zh-TW': '豆漿' },
        availability: 'SoldOut',
      },
    ]);
  });

  afterEach(async () => {
    await db.delete(orderItem);
    await db.delete(order);
  });

  afterAll(async () => {
    await client.close();
  });

  it('orders items by how many orders had them, then by the most recent order', async () => {
    await placeOrder(['tea'], { daysAgo: 5 });
    await placeOrder(['tea', 'cookie'], { daysAgo: 4 });
    await placeOrder(['tea'], { daysAgo: 3 });
    await placeOrder(['cookie'], { daysAgo: 2 });
    await placeOrder(['latte'], { daysAgo: 6 });
    await placeOrder(['latte'], { daysAgo: 1 });

    expect((await find()).map(({ menuItemId }) => menuItemId)).toEqual([
      'tea',
      'latte',
      'cookie',
    ]);
  });

  it('breaks a tie on count and last order by item id', async () => {
    await placeOrder(['tea', 'cookie'], { daysAgo: 2 });
    await placeOrder(['tea', 'cookie'], { daysAgo: 1 });

    expect((await find()).map(({ menuItemId }) => menuItemId)).toEqual([
      'cookie',
      'tea',
    ]);
  });

  it('needs the item in at least two orders, not two lines of one order', async () => {
    await placeOrder(['tea', 'tea']);
    await placeOrder(['cookie']);

    expect(await find()).toEqual([]);
  });

  it('only counts orders from the last 90 days', async () => {
    await placeOrder(['tea'], { daysAgo: 89 });
    await placeOrder(['tea'], { daysAgo: 1 });
    await placeOrder(['cookie'], { daysAgo: 91 });
    await placeOrder(['cookie'], { daysAgo: 1 });

    expect((await find()).map(({ menuItemId }) => menuItemId)).toEqual(['tea']);
  });

  it.each<OrderStatus>(['OrderCancelled', 'OrderReturned', 'OrderPaymentDue'])(
    'ignores %s orders',
    async (orderStatus) => {
      await placeOrder(['tea']);
      await placeOrder(['tea'], { orderStatus });

      expect(await find()).toEqual([]);
    },
  );

  it("only reads the caller's own orders in this store", async () => {
    await placeOrder(['tea']);
    await placeOrder(['tea'], { userId: 'someone' });
    await placeOrder(['tea'], { sellerId: 'other' });

    expect(await find()).toEqual([]);
  });

  it('leaves out items no longer orderable in this mode and flags sold-out ones', async () => {
    for (let i = 0; i < 2; i++)
      await placeOrder(['muffin', 'scone', 'bagel', 'gone', 'otherLatte']);

    expect(await find()).toEqual([
      {
        menuItemId: 'muffin',
        modifiers: {},
        addOns: [],
        servingTemperatureLevel: null,
        sweetnessLevel: null,
        customizationChanged: false,
        soldOut: true,
      },
    ]);
  });

  it('returns the latest customisation as it was ordered', async () => {
    await placeOrder(
      [
        {
          menuItemId: 'latte',
          servingTemperatureLevel: 'Hot',
          sweetnessLevel: 'NoSugar',
        },
      ],
      { daysAgo: 2 },
    );
    await placeOrder(
      [
        {
          menuItemId: 'latte',
          modifiers: [oat],
          addOns: [cookieAddOn],
          servingTemperatureLevel: 'LessIce',
          sweetnessLevel: 'HalfSugar',
        },
      ],
      { daysAgo: 1 },
    );

    expect(await find()).toEqual([
      {
        menuItemId: 'latte',
        modifiers: { milk: ['oat'] },
        addOns: [
          {
            menuItemId: 'cookie',
            modifiers: {},
            servingTemperatureLevel: null,
            sweetnessLevel: null,
          },
        ],
        servingTemperatureLevel: 'LessIce',
        sweetnessLevel: 'HalfSugar',
        customizationChanged: false,
        soldOut: false,
      },
    ]);
  });

  it('drops options that can no longer be ordered and flags the item', async () => {
    await placeOrder(['latte'], { daysAgo: 2 });
    await placeOrder(
      [
        {
          menuItemId: 'latte',
          modifiers: [soy],
          addOns: [cookieAddOn, { ...cookieAddOn, menuItemId: 'muffin' }],
          servingTemperatureLevel: 'Hot',
          sweetnessLevel: 'NoSugar',
        },
      ],
      { daysAgo: 1 },
    );

    expect(await find()).toEqual([
      expect.objectContaining({
        menuItemId: 'latte',
        modifiers: {},
        addOns: [expect.objectContaining({ menuItemId: 'cookie' })],
        customizationChanged: true,
      }),
    ]);
  });

  it('flags a required choice the last order did not make', async () => {
    await placeOrder(['latte']);
    await placeOrder(['latte']);

    expect(await find()).toEqual([
      expect.objectContaining({
        menuItemId: 'latte',
        servingTemperatureLevel: null,
        sweetnessLevel: null,
        customizationChanged: true,
      }),
    ]);
  });

  it('applies the limit after leaving out unorderable items', async () => {
    for (let i = 0; i < 3; i++) await placeOrder(['scone', 'tea']);
    for (let i = 0; i < 2; i++) await placeOrder(['cookie']);

    expect((await find(1)).map(({ menuItemId }) => menuItemId)).toEqual([
      'tea',
    ]);
  });

  it('rejects an unknown store', async () => {
    await expect(find(6, 'missing')).rejects.toThrow('organizationNotFound');
  });
});
