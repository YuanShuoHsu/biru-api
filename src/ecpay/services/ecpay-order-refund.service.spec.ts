import { ConflictException } from '@nestjs/common';
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

describe('EcpayOrderRefundService.refundOrder 現金退款與錢櫃', () => {
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
      'truncate cash_drawer_session, refund, order_item, "order", organization cascade',
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

  it('錢櫃沒開帳時不能退還現金，也不會留下退款紀錄', async () => {
    await expect(refundOf('cash')).rejects.toThrow(
      new ConflictException('common.refunds.cashDrawerNotOpen'),
    );
    expect((await client.query('select id from refund')).rows).toEqual([]);
  });

  const addSession = (id: string, organizationId: string, closed = false) =>
    client.query(
      closed
        ? `insert into cash_drawer_session (id, organization_id, business_date, status, opened_by, opening_float, closed_at, closed_by, counted_cash, expected_cash, retained_float)
           values ($1, $2, current_date, 'closed', 'amy', 0, now(), 'amy', 0, 0, 0)`
        : `insert into cash_drawer_session (id, organization_id, business_date, opened_by, opening_float)
           values ($1, $2, current_date, 'amy', 0)`,
      [id, organizationId],
    );

  it('錢櫃已關帳、或只有別家門市開帳時，都不能退還現金', async () => {
    await client.query(
      `insert into organization (id, name, slug, created_at) values ('other', 'other', 'other', now())`,
    );
    await addSession('closed', ORG, true);
    await addSession('other', 'other');

    await expect(refundOf('cash')).rejects.toThrow(
      new ConflictException('common.refunds.cashDrawerNotOpen'),
    );
  });

  it('錢櫃開帳中可以退還現金，退款在交易內就是已退款，關帳不會漏算', async () => {
    await addSession('s1', ORG);

    await refundOf('cash');

    expect(
      (await client.query('select channel, status, amount from refund')).rows,
    ).toEqual([{ channel: 'manual', status: 'settled', amount: '100.00' }]);
  });

  it('非現金的人工退款不受錢櫃影響', async () => {
    const refunded = await refundOf('twqr');

    expect(refunded).toMatchObject({ amount: '100.00', channel: 'manual' });
  });
});
