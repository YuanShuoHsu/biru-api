import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { OrdersService } from './orders.service.js';

describe('OrdersService.listOrders', () => {
  let client: PGlite;
  let service: OrdersService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new OrdersService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, created_at, updated_at) values
         ('two', '{}', 'pickup', '2', 'OrderDelivered', 'Cash', 'org', 100, now(), now()),
         ('ten', '{}', 'pickup', '10', 'OrderDelivered', 'Cash', 'org', 100, now(), now()),
         ('one', '{}', 'pickup', '1', 'OrderDelivered', 'Cash', 'org', 100, now(), now());`,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it.each([
    ['asc', ['one', 'two', 'ten']],
    ['desc', ['ten', 'two', 'one']],
  ] as const)('依單號排序時照數值順序（%s）', async (sortDirection, ids) => {
    const { data } = await service.listOrders('biru', {
      sortBy: 'orderNumber',
      sortDirection,
    });

    expect(data.map(({ id }) => id)).toEqual(ids);
  });
});
