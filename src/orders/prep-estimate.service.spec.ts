import { NotFoundException } from '@nestjs/common';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

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
    client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new PrepEstimateService(db as unknown as DrizzleDB);

    await client.exec(
      `insert into organization (id, name, slug, pickup_lead_minutes, created_at) values
         ('org', 'Biru', 'biru', 8, now()),
         ('other', 'Other', 'other', 8, now());
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
    await addOrder('other-store', 'OrderProcessing', [{ menuItemId: 'cake' }], {
      sellerId: 'other',
    });
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('只計入本店製作中、取餐時間已近的訂單，並進位到 5 分鐘', async () => {
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

  it('找不到門市時回 404', async () => {
    await expect(service.findBySlug('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
