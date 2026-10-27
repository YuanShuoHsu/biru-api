import { EventEmitter2 } from '@nestjs/event-emitter';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import * as schema from '../../db/schema/index.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../../generated/i18n.generated.js';

import { EcpayOrderRefundService } from './ecpay-order-refund.service.js';

const ORG = 'org';

describe('EcpayOrderRefundService.refundOrder 人工退款', () => {
  let client: PGlite;
  let service: EcpayOrderRefundService;

  beforeAll(async () => {
    client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new EcpayOrderRefundService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { restore: vi.fn() } as never,
      { restoreAll: vi.fn() } as never,
      { withdrawOrder: vi.fn() } as never,
      { revokeForOrder: vi.fn() } as never,
      new EventEmitter2(),
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      'truncate refund, order_item, "order", organization cascade',
    );
    await client.query(
      `insert into organization (id, name, slug, created_at) values ($1, 'biru', 'biru', now())`,
      [ORG],
    );
    for (const [id, paymentMethod] of [
      ['cash', 'Cash'],
      ['twqr', 'TWQR'],
    ]) {
      await client.query(
        `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, payment_date, order_status)
         values ($1, '{"name":"客人"}', 'dineIn', $1, $2, $3, 100, now(), 'OrderDelivered')`,
        [id, paymentMethod, ORG],
      );
      await client.query(
        `insert into order_item (id, menu_item_id, menu_item_name, order_id, order_quantity, unit_price)
         values ($1, 'latte', '拿鐵', $2, 1, 100)`,
        [`${id}-1`, id],
      );
    }
  });

  const refundOf = (orderId: string) =>
    service.refundOrder('biru', orderId, { reasonCode: 'wrongItem' });

  it('現金的人工退款直接完成退款', async () => {
    await refundOf('cash');

    expect(
      (await client.query('select channel, status, amount from refund')).rows,
    ).toEqual([{ channel: 'manual', status: 'settled', amount: '100.00' }]);
  });

  it('非現金的人工退款也是人工通道', async () => {
    const refunded = await refundOf('twqr');

    expect(refunded).toMatchObject({ amount: '100.00', channel: 'manual' });
  });
});
