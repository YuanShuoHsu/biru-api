import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import { ADMIN_BOARD_COLUMN_LIMIT } from '../common/constants/board.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { OrdersService } from './orders.service.js';

describe('OrdersService.listKitchenOrders', () => {
  let client: PGlite;
  let service: OrdersService;

  const addOrder = (
    id: string,
    {
      createdAt = '2026-11-12 01:00:00',
      orderStatus = 'OrderProcessing',
      paymentDate = '2026-11-12 01:00:00',
      pickupTime = null,
      sellerId = 'org',
    }: {
      createdAt?: string;
      orderStatus?: string;
      paymentDate?: string | null;
      pickupTime?: string | null;
      sellerId?: string;
    } = {},
  ) =>
    client.query(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, payment_date, pickup_time, seller_id, subtotal, created_at)
       values ($1, '{"name":"客人"}', 'pickup', '1', $2, 'Cash', $3, $4, $5, 100, $6)`,
      [id, orderStatus, paymentDate, pickupTime, sellerId, createdAt],
    );

  const idsOf = async (slug: string, printerId?: string) =>
    (await service.listKitchenOrders(slug, { printerId })).map(({ id }) => id);

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
         ('elsewhere-bar', 'other', 'orderTicket', '吧台', 'elsewhere-bar', 'ha1');`,
    );

    await addOrder('paid-late', { paymentDate: '2026-11-12 03:00:00' });
    await addOrder('paid-early', { paymentDate: '2026-11-12 02:00:00' });
    await addOrder('scheduled', {
      paymentDate: '2026-11-12 00:30:00',
      pickupTime: '2026-11-12 02:30:00',
    });
    await addOrder('tie-b', { paymentDate: '2026-11-12 04:00:00' });
    await addOrder('tie-a', { paymentDate: '2026-11-12 04:00:00' });
    await addOrder('due', {
      orderStatus: 'OrderPaymentDue',
      paymentDate: null,
    });
    await addOrder('ready', { orderStatus: 'OrderPickupAvailable' });
    await addOrder('other-store', { sellerId: 'other' });

    await client.exec(
      `insert into order_item (id, order_id, menu_item_id, menu_item_name, order_quantity, unit_price, prepared_at) values
         ('latte', 'paid-early', 'm1', '拿鐵', 1, 100, now()),
         ('cake', 'paid-early', 'm2', '蛋糕', 2, 100, null),
         ('tea', 'paid-late', 'm3', '紅茶', 1, 100, null),
         ('soda', 'scheduled', 'm4', '汽水', 1, 100, null),
         ('elsewhere', 'other-store', 'm1', '拿鐵', 1, 100, null);
       insert into order_ticket_job (id, order_id, printer_id, organization_id, kind, order_item_ids, copy, status) values
         ('early-bar', 'paid-early', 'bar', 'org', 'order', '{latte}', 'original', 'printed'),
         ('early-kitchen', 'paid-early', 'kitchen', 'org', 'order', '{cake}', 'original', 'queued'),
         ('late-kitchen', 'paid-late', 'kitchen', 'org', 'order', '{tea}', 'original', 'queued'),
         ('scheduled-bar-cancelled', 'scheduled', 'bar', 'org', 'order', '{soda}', 'original', 'cancelled'),
         ('scheduled-bar-reprint', 'scheduled', 'bar', 'org', 'order', '{soda}', 'reprint', 'printed'),
         ('other-bar', 'other-store', 'elsewhere-bar', 'other', 'order', '{elsewhere}', 'original', 'printed');
       insert into refund (id, order_id, amount, scope, channel, items, status) values
         ('cake-refund', 'paid-early', 100, 'partial', 'manual', '[{"orderItemId":"cake","quantity":1,"amount":"100","menuItemName":"蛋糕","unitPrice":"100"}]', 'refunded');`,
    );

    await client.query(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, payment_date, seller_id, subtotal, created_at)
       select 'busy-' || n, '{"name":"客人"}', 'pickup', '1', 'OrderProcessing', 'Cash', '2026-11-12 01:00:00'::timestamp + n * interval '1 second', 'busy', 100, now()
       from generate_series(0, $1) n`,
      [ADMIN_BOARD_COLUMN_LIMIT],
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('只列本店製作中的訂單，依預約取餐或付款時間排序，同時間依 id', async () => {
    await expect(idsOf('biru')).resolves.toEqual([
      'paid-early',
      'scheduled',
      'paid-late',
      'tie-a',
      'tie-b',
    ]);
  });

  it('帶出品項做好的標記、已退款數量與工作單印表機', async () => {
    const [paidEarly] = await service.listKitchenOrders('biru', {});

    expect(paidEarly.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'latte',
          preparedAt: expect.any(Date),
          refundedQuantity: 0,
        }),
        expect.objectContaining({ id: 'cake', refundedQuantity: 1 }),
      ]),
    );
    expect(paidEarly.items).toHaveLength(2);
    expect(paidEarly.orderTicketPrinterIds).toEqual(['bar', 'kitchen']);
  });

  it('指定印表機時只列那台未取消正本工作單負責的品項，沒有品項的訂單不列', async () => {
    const itemIdsOf = async (printerId: string) =>
      (await service.listKitchenOrders('biru', { printerId })).map(
        ({ id, items }) => [id, items.map((item) => item.id)],
      );

    await expect(itemIdsOf('bar')).resolves.toEqual([
      ['paid-early', ['latte']],
    ]);
    await expect(itemIdsOf('kitchen')).resolves.toEqual([
      ['paid-early', ['cake']],
      ['paid-late', ['tea']],
    ]);
  });

  it('別家店的印表機查不到任何訂單', async () => {
    await expect(idsOf('biru', 'elsewhere-bar')).resolves.toEqual([]);
  });

  it('最多回 ADMIN_BOARD_COLUMN_LIMIT 筆，取最早的', async () => {
    const ids = await idsOf('busy');

    expect(ids).toHaveLength(ADMIN_BOARD_COLUMN_LIMIT);
    expect(ids[0]).toBe('busy-0');
    expect(ids).not.toContain(`busy-${ADMIN_BOARD_COLUMN_LIMIT}`);
  });
});
