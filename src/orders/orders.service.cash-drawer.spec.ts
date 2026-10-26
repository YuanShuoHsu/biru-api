import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import type { OrderTicketService } from './order-ticket.service.js';
import { OrdersService } from './orders.service.js';

const ORG = 'org';

describe('OrdersService.applyTransitions 現金付款與錢櫃', () => {
  let client: PGlite;
  let service: OrdersService;

  beforeAll(async () => {
    client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new OrdersService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { enqueueOrder: vi.fn() } as unknown as OrderTicketService,
      new EventEmitter2(),
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      'truncate cash_drawer_session, "order", organization cascade',
    );
    await client.query(
      `insert into organization (id, name, slug, created_at) values ($1, 'biru', 'biru', now())`,
      [ORG],
    );
    await client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal)
       values ('cash', '{"name":"客人"}', 'dineIn', '1', 'Cash', $1, 100)`,
      [ORG],
    );
  });

  const addSession = (status: 'open' | 'closed') =>
    client.query(
      `insert into cash_drawer_session (id, organization_id, business_date, status, opened_by, opening_float, closed_at, closed_by, counted_cash, expected_cash, retained_float)
       values ($1, $2, current_date, $3, 'amy', 0, ${status === 'closed' ? "now(), 'amy', 0, 0, 0" : 'null, null, null, null, null'})`,
      [`s-${status}`, ORG, status],
    );

  const confirmCash = () =>
    service.applyTransitions('biru', ['cash'], 'OrderProcessing');

  it('錢櫃已關帳時不能確認現金付款', async () => {
    await addSession('closed');

    await expect(confirmCash()).rejects.toThrow(
      new BadRequestException('common.orders.cashDrawerNotOpen'),
    );
  });

  it('錢櫃開帳中可以確認現金付款', async () => {
    await addSession('open');

    const [confirmed] = await confirmCash();

    expect(confirmed.orderStatus).toBe('OrderProcessing');
  });

  it('別家門市開帳中不算，被拒絕時訂單不變', async () => {
    await client.query(
      `insert into organization (id, name, slug, created_at) values ('other', 'other', 'other', now())`,
    );
    await client.query(
      `insert into cash_drawer_session (id, organization_id, business_date, opened_by, opening_float)
       values ('s-other', 'other', current_date, 'amy', 0)`,
    );

    await expect(confirmCash()).rejects.toThrow(
      new BadRequestException('common.orders.cashDrawerNotOpen'),
    );
    const {
      rows: [unchanged],
    } = await client.query<{ order_status: string; payment_date: Date | null }>(
      `select order_status, payment_date from "order" where id = 'cash'`,
    );
    expect(unchanged).toEqual({
      order_status: 'OrderPaymentDue',
      payment_date: null,
    });
  });

  it('關帳後也不能把現金訂單退回待付款', async () => {
    await addSession('open');
    await confirmCash();
    await client.query(
      `update cash_drawer_session set status = 'closed', closed_at = now(), closed_by = 'amy', counted_cash = 0, expected_cash = 0, retained_float = 0`,
    );

    await expect(
      service.applyTransitions('biru', ['cash'], 'OrderPaymentDue'),
    ).rejects.toThrow(
      new BadRequestException('common.orders.cashDrawerNotOpen'),
    );
  });

  it('不涉及現金收付的狀態轉換不受錢櫃影響', async () => {
    await addSession('open');
    await confirmCash();
    await client.query(
      `update cash_drawer_session set status = 'closed', closed_at = now(), closed_by = 'amy', counted_cash = 0, expected_cash = 0, retained_float = 0`,
    );

    const [ready] = await service.applyTransitions(
      'biru',
      ['cash'],
      'OrderPickupAvailable',
    );

    expect(ready.orderStatus).toBe('OrderPickupAvailable');
  });
});
