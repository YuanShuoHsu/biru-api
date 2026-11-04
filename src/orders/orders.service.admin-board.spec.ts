import { NotFoundException } from '@nestjs/common';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import {
  ADMIN_BOARD_COLUMN_LIMIT,
  ADMIN_BOARD_DONE_COLUMN_LIMIT,
} from '../common/constants/board.js';
import * as schema from '../db/schema/index.js';
import { ORDER_FLOW_STATUSES } from '../db/schema/orders.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { OrdersService } from './orders.service.js';

const HOUR_MS = 60 * 60 * 1000;

describe('OrdersService.listAdminBoard', () => {
  let client: PGlite;
  let service: OrdersService;

  const at = (offsetMs: number) =>
    new Date(Date.now() + offsetMs).toISOString();

  const addOrder = (
    id: string,
    orderStatus: string,
    {
      createdAt = at(-HOUR_MS),
      paymentMethod = 'Credit',
      pickupTime = null,
      sellerId = 'org',
      updatedAt = createdAt,
    }: {
      createdAt?: string;
      paymentMethod?: string;
      pickupTime?: string | null;
      sellerId?: string;
      updatedAt?: string;
    } = {},
  ) =>
    client.query(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, pickup_time, seller_id, subtotal, created_at, updated_at)
       values ($1, '{"name":"客人"}', 'pickup', '1', $2, $3, $4, $5, 100, $6, $7)`,
      [
        id,
        orderStatus,
        paymentMethod,
        pickupTime,
        sellerId,
        createdAt,
        updatedAt,
      ],
    );

  const column = async (slug: string, orderStatus: string) =>
    (await service.listAdminBoard(slug)).find(
      (entry) => entry.orderStatus === orderStatus,
    )!.orders;

  const idsIn = async (slug: string, orderStatus: string) =>
    (await column(slug, orderStatus)).map(({ id }) => id);

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
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('busy', 'Busy', 'busy', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into printer (id, organization_id, purpose, name, username, digest_ha1) values
         ('bar', 'org', 'orderTicket', '吧台', 'bar', 'ha1'),
         ('kitchen', 'org', 'orderTicket', '廚房', 'kitchen', 'ha1'),
         ('pastry', 'org', 'orderTicket', '甜點', 'pastry', 'ha1');`,
    );

    await addOrder('due-cash', 'OrderPaymentDue', { paymentMethod: 'Cash' });
    await addOrder('due-credit', 'OrderPaymentDue');
    await addOrder('yesterday-evening', 'OrderProcessing', {
      createdAt: at(-23 * HOUR_MS),
    });
    await addOrder('walk-in', 'OrderProcessing', {
      createdAt: at(-2 * HOUR_MS),
    });
    await addOrder('placed-yesterday', 'OrderProcessing', {
      createdAt: at(-30 * HOUR_MS),
      pickupTime: at(-HOUR_MS),
    });
    await addOrder('scheduled-today', 'OrderProcessing', {
      pickupTime: at(23 * HOUR_MS),
    });
    await addOrder('scheduled-later', 'OrderProcessing', {
      pickupTime: at(25 * HOUR_MS),
    });
    await addOrder('stale', 'OrderProcessing', {
      createdAt: at(-25 * HOUR_MS),
    });
    await addOrder('stale-pickup', 'OrderProcessing', {
      createdAt: at(-30 * HOUR_MS),
      pickupTime: at(-25 * HOUR_MS),
    });
    await addOrder('ready', 'OrderPickupAvailable');
    await addOrder('delivered', 'OrderDelivered');
    await addOrder('delivered-long-ago', 'OrderDelivered', {
      createdAt: at(-25 * HOUR_MS),
      updatedAt: at(0),
    });
    await addOrder('cancelled', 'OrderCancelled');
    await addOrder('problem', 'OrderProblem');
    await addOrder('other-store', 'OrderProcessing', { sellerId: 'other' });

    await client.exec(
      `insert into order_ticket_job (id, order_id, printer_id, organization_id, kind, order_item_ids, copy, status, created_at) values
         ('ticket-printed', 'walk-in', 'kitchen', 'org', 'order', '{}', 'original', 'printed', now() - interval '3 minutes'),
         ('ticket-queued', 'walk-in', 'bar', 'org', 'order', '{}', 'original', 'queued', now() - interval '2 minutes'),
         ('ticket-cancelled', 'walk-in', 'pastry', 'org', 'order', '{}', 'original', 'cancelled', now() - interval '1 minute');
       insert into invoice (id, order_id, type, status) values
         ('voided-invoice', 'walk-in', 'personal', 'voided'),
         ('active-invoice', 'walk-in', 'personal', 'issued');
       insert into invoice_print_job (id, invoice_id, organization_id, copy, status, created_at) values
         ('print-older', 'active-invoice', 'org', 'reprint', 'queued', now() - interval '3 minutes'),
         ('print-newer', 'active-invoice', 'org', 'reprint', 'sent', now() - interval '2 minutes'),
         ('print-done', 'active-invoice', 'org', 'original', 'printed', now() - interval '1 minute');`,
    );

    await client.query(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, created_at)
       select 'busy-' || n, '{"name":"客人"}', 'pickup', '1', 'OrderProcessing', 'Credit', 'busy', 100, $1::timestamp + n * interval '1 second'
       from generate_series(0, $2) n`,
      [at(-2 * HOUR_MS), ADMIN_BOARD_COLUMN_LIMIT],
    );
    for (let n = 0; n <= ADMIN_BOARD_DONE_COLUMN_LIMIT; n += 1)
      await addOrder(`busy-done-${n}`, 'OrderDelivered', {
        createdAt: at(-2 * HOUR_MS + ((n * 4) % 11) * 60 * 1000),
        sellerId: 'busy',
        updatedAt: at(-n * 60 * 1000),
      });
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('依流程狀態各回一欄，取消與異常等終止狀態的單不上看板', async () => {
    const board = await service.listAdminBoard('biru');

    expect(board.map(({ orderStatus }) => orderStatus)).toEqual([
      ...ORDER_FLOW_STATUSES,
    ]);
    expect(
      board.flatMap(({ orders }) => orders.map(({ id }) => id)).sort(),
    ).toEqual(
      [
        'delivered',
        'due-cash',
        'placed-yesterday',
        'ready',
        'scheduled-today',
        'walk-in',
        'yesterday-evening',
      ].sort(),
    );
  });

  it('待付款欄只收現金單', async () => {
    await expect(idsIn('biru', 'OrderPaymentDue')).resolves.toEqual([
      'due-cash',
    ]);
  });

  it('只收過去 24 小時內與未來 24 小時內預約的本店訂單，依取餐或建立時間排序', async () => {
    await expect(idsIn('biru', 'OrderProcessing')).resolves.toEqual([
      'yesterday-evening',
      'walk-in',
      'placed-yesterday',
      'scheduled-today',
    ]);
    await expect(idsIn('biru', 'OrderPickupAvailable')).resolves.toEqual([
      'ready',
    ]);
    await expect(idsIn('biru', 'OrderDelivered')).resolves.toEqual([
      'delivered',
    ]);
  });

  it('進行中的欄最多回 ADMIN_BOARD_COLUMN_LIMIT 筆，取最早的', async () => {
    const ids = await idsIn('busy', 'OrderProcessing');

    expect(ids).toHaveLength(ADMIN_BOARD_COLUMN_LIMIT);
    expect(ids[0]).toBe('busy-0');
    expect(ids).not.toContain(`busy-${ADMIN_BOARD_COLUMN_LIMIT}`);
  });

  it('完成欄依最後更新時間由新到舊，只取 ADMIN_BOARD_DONE_COLUMN_LIMIT 筆', async () => {
    await expect(idsIn('busy', 'OrderDelivered')).resolves.toEqual(
      Array.from(
        { length: ADMIN_BOARD_DONE_COLUMN_LIMIT },
        (_, n) => `busy-done-${n}`,
      ),
    );
  });

  it('工作單只列進行中的，補印印表機排除已取消的工作單', async () => {
    const walkIn = (await column('biru', 'OrderProcessing')).find(
      ({ id }) => id === 'walk-in',
    )!;

    expect(walkIn.orderTicketJobs).toEqual([
      expect.objectContaining({
        id: 'ticket-queued',
        printerName: '吧台',
        status: 'queued',
      }),
    ]);
    expect(walkIn.orderTicketPrinterIds).toEqual(['kitchen', 'bar']);
  });

  it('發票取未作廢的一張，列印工作只帶最新一筆進行中的', async () => {
    const walkIn = (await column('biru', 'OrderProcessing')).find(
      ({ id }) => id === 'walk-in',
    )!;

    expect(walkIn.invoice).toMatchObject({
      id: 'active-invoice',
      printJob: { id: 'print-newer', status: 'sent' },
    });
  });

  it('找不到門市時回 404', async () => {
    await expect(service.listAdminBoard('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
