import { NotFoundException } from '@nestjs/common';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { createPGlite } from '../../test/pglite.js';
import { PrepEstimateService } from './prep-estimate.service.js';

describe('PrepEstimateService', () => {
  let client: PGlite;
  let service: PrepEstimateService;

  const addOrder = async (
    id: string,
    orderStatus: string,
    items: { addOns?: string[]; menuItemId: string }[],
    { pickupTime = null, sellerId = 'org' } = {} as {
      pickupTime?: Date | null;
      sellerId?: string;
    },
  ) => {
    await client.query(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, pickup_time, seller_id, subtotal)
       values ($1, '{"name":"客人"}', 'pickup', '1', $2, 'Credit', $3, $4, 100)`,
      [id, orderStatus, pickupTime?.toISOString() ?? null, sellerId],
    );
    for (const [index, { addOns = [], menuItemId }] of items.entries())
      await client.query(
        `insert into order_item (id, order_id, menu_item_id, menu_item_name, order_quantity, unit_price, add_ons)
         values ($1, $2, $3, $3, 1, 100, $4)`,
        [
          `${id}-${index}`,
          id,
          menuItemId,
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

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new PrepEstimateService(db as unknown as DrizzleDB);

    await client.exec(
      `insert into organization (id, name, slug, pickup_lead_minutes, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', 8, now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('other', 'Other', 'other', 8, now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('busy', 'Busy', 'busy', 8, now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into menu (id, organization_id, name) values ('menu', 'org', '{"zh-TW":"菜單"}');
       insert into menu_item (id, menu_id, name) values
         ('latte', 'menu', '{"zh-TW":"拿鐵"}'),
         ('cake', 'menu', '{"zh-TW":"蛋糕"}');
       insert into offer (id, menu_item_id, price, delivery_lead_time_minutes, created_at) values
         ('latte-offer', 'latte', 100, 7, now()),
         ('cake-offer', 'cake', 100, 20, now() - interval '1 day'),
         ('cake-newer-offer', 'cake', 100, 60, now());`,
    );

    await addOrder('making-with-cake', 'OrderProcessing', [
      { addOns: ['cake'], menuItemId: 'latte' },
    ]);
    await addOrder('making-latte', 'OrderProcessing', [
      { menuItemId: 'latte' },
    ]);
    await addOrder('unpaid', 'OrderPaymentDue', [{ menuItemId: 'cake' }]);
    await addOrder('ready', 'OrderPickupAvailable', [{ menuItemId: 'cake' }]);
    await addOrder('later', 'OrderProcessing', [{ menuItemId: 'cake' }], {
      pickupTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
    });
    await addOrder('stale', 'OrderProcessing', [{ menuItemId: 'cake' }], {
      pickupTime: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    await client.query(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, created_at)
       values ('stale-walk-in', '{"name":"客人"}', 'counter', '1', 'OrderProcessing', 'Cash', 'org', 100, $1)`,
      [new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()],
    );
    await addOrder('other-store', 'OrderProcessing', [{ menuItemId: 'cake' }], {
      sellerId: 'other',
    });
    for (const [index, minutesAgo] of [40, 20, 16, 12, 8, 4].entries())
      await client.query(
        `insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, payment_date, ready_at)
         values ($1, '{"name":"客人"}', 'counter', '1', 'OrderDelivered', 'Cash', 'other', 100, $2, $3)`,
        [
          `other-ready-${index}`,
          new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
        ],
      );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('只計入本店看板時間窗內製作中、取餐時間已近的訂單，並進位到 5 分鐘', async () => {
    await expect(service.findBySlug('biru')).resolves.toEqual({
      basis: 'leadTime',
      estimatedMinutes: 40,
      queuedOrders: 2,
    });
  });

  it('下單驗證以本單製作時間加上佇列', async () => {
    await expect(
      service.prepMinutesWith({ id: 'org', pickupLeadMinutes: 8 }, 30),
    ).resolves.toBe(58);
  });

  it('近 30 分鐘出餐達 5 張時，排隊訂單以實際出餐速率估算', async () => {
    await expect(service.findBySlug('other')).resolves.toEqual({
      basis: 'observed',
      estimatedMinutes: 15,
      queuedOrders: 1,
    });
    await expect(
      service.prepMinutesWith({ id: 'other', pickupLeadMinutes: 8 }, 30),
    ).resolves.toBeCloseTo(34);
  });

  it('出餐速率只取最近 20 張出餐的訂單', async () => {
    await addOrder('busy-making', 'OrderProcessing', [], { sellerId: 'busy' });
    for (const minutesAgo of [
      29,
      ...Array.from({ length: 20 }, (_, i) => i + 1),
    ])
      await client.query(
        `insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, payment_date, ready_at)
         values ($1, '{"name":"客人"}', 'counter', '1', 'OrderDelivered', 'Cash', 'busy', 100, $2, $3)`,
        [
          `busy-ready-${minutesAgo}`,
          new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
        ],
      );

    await expect(
      service.prepMinutesWith({ id: 'busy', pickupLeadMinutes: 8 }, 30),
    ).resolves.toBeCloseTo(31);
  });

  it('找不到門市時回 404', async () => {
    await expect(service.findBySlug('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
