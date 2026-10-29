import { BadRequestException, ConflictException } from '@nestjs/common';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import {
  MAX_PAYMENT_ATTEMPTS_PER_ORDER,
  OrdersService,
} from './orders.service.js';

describe('OrdersService.createPaymentAttempt', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: OrdersService;

  const attemptCount = async (orderId: string) =>
    (
      await client.query<{ count: number }>(
        'select count(*)::int as count from ecpay_payment_attempt where order_id = $1',
        [orderId],
      )
    ).rows[0].count;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new OrdersService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { t: (key: string) => key } as never,
      {} as never,
      {} as never,
    );

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "order" (id, customer, mode, order_number, order_status, payment_method, confirmation_number, seller_id, subtotal, created_at) values
         ('o1', '{"name":"客人"}', 'counter', '1', 'OrderPaymentDue', 'Credit', 'c1', 'org', 100, now()),
         ('o2', '{"name":"客人"}', 'counter', '2', 'OrderPaymentDue', 'Credit', 'c2', 'org', 100, now()),
         ('o3', '{"name":"客人"}', 'counter', '3', 'OrderPaymentDue', 'Credit', 'c3', 'org', 100, now());`,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('同一張訂單的付款嘗試到上限後拒絕再建立', async () => {
    for (let i = 0; i < MAX_PAYMENT_ATTEMPTS_PER_ORDER; i++)
      await service.createPaymentAttempt('o1', null);

    await expect(service.createPaymentAttempt('o1', null)).rejects.toThrow(
      new ConflictException('common.orders.paymentAttemptsExhausted'),
    );
    expect(await attemptCount('o1')).toBe(MAX_PAYMENT_ATTEMPTS_PER_ORDER);

    await expect(
      service.createPaymentAttempt('o2', null),
    ).resolves.toMatchObject({ confirmationNumber: 'c2' });
    expect(await attemptCount('o2')).toBe(1);
  });

  it('讀到訂單後才被付款通知改成已付款時，不建立付款嘗試', async () => {
    const findFirst = db.query.order.findFirst.bind(db.query.order);
    const spy = vi
      .spyOn(db.query.order, 'findFirst')
      .mockImplementationOnce(async (config) => {
        const found = await findFirst(config);
        await client.query(
          `update "order" set order_status = 'OrderProcessing' where id = 'o3'`,
        );
        return found;
      });

    await expect(service.createPaymentAttempt('o3', null)).rejects.toThrow(
      new BadRequestException('common.orders.notAwaitingPayment'),
    );
    expect(await attemptCount('o3')).toBe(0);
    spy.mockRestore();
  });
});
