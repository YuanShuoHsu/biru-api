import { PGlite } from '@electric-sql/pglite';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../../test/pglite.js';
import * as schema from '../../db/schema/index.js';
import { invoice } from '../../db/schema/invoices.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';

import { EcpayOrderInvoiceService } from './ecpay-order-invoice.service.js';

describe('EcpayOrderInvoiceService.findVoidedForOrder（PGlite）', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: EcpayOrderInvoiceService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new EcpayOrderInvoiceService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new EventEmitter2(),
      {} as never,
    );

    for (const slug of ['biru', 'other'])
      await client.query(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, $1, $1, now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
        [slug],
      );
    await client.exec(`
      insert into "user" (id, name, email, first_name) values ('staff', '小明', 'staff@example.com', '小明');
      insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, payment_date, order_status)
      values ('order', '{"name":"客人"}', 'dineIn', '1', 'Cash', 'biru', 100, now(), 'OrderDelivered');
    `);
    await db.insert(invoice).values([
      {
        id: 'first',
        orderId: 'order',
        type: 'personal',
        status: 'voided',
        invoiceNumber: 'AB00000001',
        voidedAt: new Date('2026-11-01T01:00:00Z'),
        voidedBy: 'staff',
        voidReason: '統編開錯',
      },
      {
        id: 'second',
        orderId: 'order',
        type: 'company',
        status: 'voided',
        invoiceNumber: 'AB00000002',
        voidedAt: new Date('2026-11-02T01:00:00Z'),
        voidedBy: 'deleted-user',
        voidReason: '抬頭開錯',
      },
      {
        id: 'reconciled',
        orderId: 'order',
        type: 'company',
        status: 'voided',
        invoiceNumber: 'AB00000003',
        voidedAt: new Date('2026-11-03T01:00:00Z'),
      },
      {
        id: 'active',
        orderId: 'order',
        type: 'company',
        status: 'issued',
        invoiceNumber: 'AB00000004',
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('只回傳已作廢的發票，新的在前，並帶出作廢人員與原因', async () => {
    const voided = await service.findVoidedForOrder('biru', 'order');

    expect(
      voided.map(({ id, reason, operatorName, operatorDeleted }) => ({
        id,
        reason,
        operatorName,
        operatorDeleted,
      })),
    ).toEqual([
      {
        id: 'reconciled',
        reason: null,
        operatorName: null,
        operatorDeleted: false,
      },
      {
        id: 'second',
        reason: '抬頭開錯',
        operatorName: null,
        operatorDeleted: true,
      },
      {
        id: 'first',
        reason: '統編開錯',
        operatorName: '小明',
        operatorDeleted: false,
      },
    ]);
  });

  it('其他門市的訂單回 404', async () => {
    await expect(
      service.findVoidedForOrder('other', 'order'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
