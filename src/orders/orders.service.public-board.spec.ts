import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { OrdersService } from './orders.service.js';

describe('OrdersService.listPublicBoard', () => {
  let client: PGlite;
  let service: OrdersService;

  const addOrder = (id: string, orderStatus: string, paymentMethod: string) =>
    client.query(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, created_at)
       values ($1, '{"name":"客人"}', 'pickup', '1', $2, $3, 'org', 100, now() - interval '1 hour')`,
      [id, orderStatus, paymentMethod],
    );

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
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');`,
    );
    await addOrder('due-cash', 'OrderPaymentDue', 'Cash');
    await addOrder('due-credit', 'OrderPaymentDue', 'Credit');
    await addOrder('processing-credit', 'OrderProcessing', 'Credit');
    await addOrder('ready-cash', 'OrderPickupAvailable', 'Cash');
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('待付款欄和後台看板一樣只列現金單，線上付款中的單不上看板', async () => {
    const board = await service.listPublicBoard('biru');

    expect(board.map(({ orderId }) => orderId).sort()).toEqual([
      'due-cash',
      'processing-credit',
      'ready-cash',
    ]);
  });
});
