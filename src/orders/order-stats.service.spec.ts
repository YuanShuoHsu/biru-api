import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { createPGlite } from '../../test/pglite.js';
import { OrderStatsService } from './order-stats.service.js';

describe('OrderStatsService', () => {
  let client: PGlite;
  let service: OrderStatsService;

  const query = {
    since: '2026-10-02T00:00:00+08:00',
    bucketUnit: 'day' as const,
    bucketSize: 1,
    bucketCount: 1,
  };

  const addOrder = (
    id: string,
    orderDate: string,
    { orderStatus = 'OrderDelivered', sellerId = 'org' } = {},
  ) =>
    client.query(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, order_date)
       values ($1, '{"name":"客人"}', 'counter', '1', $2, 'Cash', $3, 100, $4::timestamptz at time zone 'UTC')`,
      [id, orderStatus, sellerId, orderDate],
    );

  const addRefund = (
    id: string,
    orderId: string,
    createdAt: string,
    status = 'refunded',
  ) =>
    client.query(
      `insert into refund (id, order_id, amount, scope, channel, status, created_at)
       values ($1, $2, 100, 'full', 'manual', $3, $4::timestamptz at time zone 'UTC')`,
      [id, orderId, status, createdAt],
    );

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new OrderStatsService(db as unknown as DrizzleDB);

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('退款率分子只算本期計入、且已確認退款的訂單，不受退款日影響', async () => {
    await addOrder('yesterday', '2026-10-01T02:00:00Z');
    await addRefund('r-yesterday', 'yesterday', '2026-10-02T03:00:00Z');
    await addOrder('kept', '2026-10-02T02:00:00Z');
    await addOrder('refunded', '2026-10-02T02:00:00Z');
    await addRefund('r-refunded-1', 'refunded', '2026-10-02T04:00:00Z');
    await addRefund('r-refunded-2', 'refunded', '2026-10-02T05:00:00Z');
    await addOrder('later', '2026-10-02T02:00:00Z');
    await addRefund('r-later', 'later', '2026-10-05T03:00:00Z');
    await addOrder('pending', '2026-10-02T02:00:00Z');
    await addRefund('r-pending', 'pending', '2026-10-02T03:00:00Z', 'pending');
    await addOrder('cancelled', '2026-10-02T02:00:00Z', {
      orderStatus: 'OrderCancelled',
    });
    await addRefund('r-cancelled', 'cancelled', '2026-10-02T03:00:00Z');
    await addOrder('other', '2026-10-02T02:00:00Z', { sellerId: 'other' });
    await addRefund('r-other', 'other', '2026-10-02T03:00:00Z');

    const stats = await service.getStats('biru', query, false);

    expect(stats.buckets[0].orders).toBe(4);
    expect(stats.refundedOrders).toBe(3);
    expect(stats.refundedPeriodOrders).toBe(2);
  });
});
