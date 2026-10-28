import { BadRequestException } from '@nestjs/common';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { createPGlite } from '../../test/pglite.js';
import { SalesReportService } from './sales-report.service.js';

describe('SalesReportService', () => {
  let client: PGlite;
  let service: SalesReportService;

  const range = {
    since: '2026-09-30T00:00:00+08:00',
    until: '2026-10-03T00:00:00+08:00',
  };

  const addOrder = (
    id: string,
    {
      discount = null,
      mode = 'counter',
      orderDate = '2026-10-01T02:00:00Z',
      orderStatus = 'OrderDelivered',
      paymentDate = null,
      paymentMethod = 'Cash',
      sellerId = 'org',
      subtotal,
    }: {
      discount?: number | null;
      mode?: string;
      orderDate?: string;
      orderStatus?: string;
      paymentDate?: string | null;
      paymentMethod?: string;
      sellerId?: string;
      subtotal: number;
    },
  ) =>
    client.query(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, discount, order_date, payment_date)
       values ($1, '{"name":"客人"}', $2, '1', $3, $4, $5, $6, $7, $8::timestamptz at time zone 'UTC', $9::timestamptz at time zone 'UTC')`,
      [
        id,
        mode,
        orderStatus,
        paymentMethod,
        sellerId,
        subtotal,
        discount,
        orderDate,
        paymentDate,
      ],
    );

  const addRefund = (
    id: string,
    orderId: string,
    amount: number,
    createdAt: string,
    status = 'refunded',
  ) =>
    client.query(
      `insert into refund (id, order_id, amount, scope, channel, status, created_at)
       values ($1, $2, $3, 'partial', 'manual', $4, $5::timestamptz at time zone 'UTC')`,
      [id, orderId, amount, status, createdAt],
    );

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new SalesReportService(
      db as unknown as DrizzleDB,
      {
        t: (key: string) => key,
      } as unknown as I18nService<I18nTranslations>,
    );

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('cents', 'Cents', 'cents', now(), 'TW', '桃園市', '大園區', '中正東路一段');`,
    );

    await addOrder('before-midnight', {
      discount: 10,
      paymentDate: '2026-09-30T15:30:00Z',
      subtotal: 100,
    });
    await addOrder('after-midnight', {
      mode: 'pickup',
      orderStatus: 'OrderProcessing',
      paymentDate: '2026-09-30T16:30:00Z',
      paymentMethod: 'Credit',
      subtotal: 200,
    });
    await addOrder('returned-unpaid-date', {
      orderStatus: 'OrderReturned',
      subtotal: 50,
    });
    await addOrder('awaiting-payment', {
      orderStatus: 'OrderPaymentDue',
      subtotal: 1000,
    });
    await addOrder('cancelled', {
      orderStatus: 'OrderCancelled',
      subtotal: 1000,
    });
    await addOrder('before-range', {
      paymentDate: '2026-09-29T15:59:00Z',
      subtotal: 1000,
    });
    await addOrder('other-store', { sellerId: 'other', subtotal: 1000 });

    await addRefund('refund', 'after-midnight', 50, '2026-10-02T03:00:00Z');
    await addRefund(
      'pending-refund',
      'before-midnight',
      30,
      '2026-10-02T03:00:00Z',
      'pending',
    );
    await addRefund('other-refund', 'other-store', 500, '2026-10-02T03:00:00Z');

    await addOrder('cents-credit', {
      paymentMethod: 'Credit',
      sellerId: 'cents',
      subtotal: 0.3,
    });
    await addOrder('cents-cash', { sellerId: 'cents', subtotal: 0.1 });
    await addRefund(
      'cents-refund',
      'cents-credit',
      0.1,
      '2026-10-02T03:00:00Z',
      'settled',
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('依店家時區日期分組，退款依退款日歸期並從淨額扣除，只計本店的計入訂單', async () => {
    await expect(
      service.getSalesReport('biru', { ...range, groupBy: 'day' }),
    ).resolves.toEqual({
      groupBy: 'day',
      rows: [
        {
          key: '2026-09-30',
          orders: 1,
          revenue: 90,
          discount: 10,
          refunded: 0,
          net: 90,
        },
        {
          key: '2026-10-01',
          orders: 2,
          revenue: 250,
          discount: 0,
          refunded: 0,
          net: 250,
        },
        {
          key: '2026-10-02',
          orders: 0,
          revenue: 0,
          discount: 0,
          refunded: 50,
          net: -50,
        },
      ],
      totals: { orders: 3, revenue: 340, discount: 10, refunded: 50, net: 290 },
    });
  });

  it('依店家時區小時分組並由小到大排序', async () => {
    const { rows } = await service.getSalesReport('biru', {
      ...range,
      groupBy: 'hour',
    });

    expect(
      rows.map(({ key, refunded, revenue }) => [key, revenue, refunded]),
    ).toEqual([
      ['0', 200, 0],
      ['10', 50, 0],
      ['11', 0, 50],
      ['23', 90, 0],
    ]);
  });

  it('依付款方式分組時退款歸到原訂單的付款方式，依營收由大到小排序', async () => {
    const { rows } = await service.getSalesReport('biru', {
      ...range,
      groupBy: 'paymentMethod',
    });

    expect(rows).toEqual([
      {
        key: 'Credit',
        orders: 1,
        revenue: 200,
        discount: 0,
        refunded: 50,
        net: 150,
      },
      {
        key: 'Cash',
        orders: 2,
        revenue: 140,
        discount: 10,
        refunded: 0,
        net: 140,
      },
    ]);
  });

  it('依點餐方式分組', async () => {
    const { rows } = await service.getSalesReport('biru', {
      ...range,
      groupBy: 'mode',
    });

    expect(rows.map(({ key, net, orders }) => [key, orders, net])).toEqual([
      ['pickup', 1, 150],
      ['counter', 2, 140],
    ]);
  });

  it('已結算的退款也計入，金額沒有浮點誤差', async () => {
    await expect(
      service.getSalesReport('cents', { ...range, groupBy: 'paymentMethod' }),
    ).resolves.toEqual({
      groupBy: 'paymentMethod',
      rows: [
        {
          key: 'Credit',
          orders: 1,
          revenue: 0.3,
          discount: 0,
          refunded: 0.1,
          net: 0.2,
        },
        {
          key: 'Cash',
          orders: 1,
          revenue: 0.1,
          discount: 0,
          refunded: 0,
          net: 0.1,
        },
      ],
      totals: { orders: 2, revenue: 0.4, discount: 0, refunded: 0.1, net: 0.3 },
    });
  });

  it('結束時間不晚於起始時間時拒絕', async () => {
    await expect(
      service.getSalesReport('biru', {
        since: range.since,
        until: range.since,
        groupBy: 'day',
      }),
    ).rejects.toThrow(new BadRequestException('common.reports.rangeInvalid'));
  });

  it('區間超過 366 天時拒絕', async () => {
    await expect(
      service.getSalesReport('biru', {
        since: '2026-01-01T00:00:00+08:00',
        until: '2027-01-03T00:00:00+08:00',
        groupBy: 'mode',
      }),
    ).rejects.toThrow(new BadRequestException('common.reports.rangeTooLong'));
  });
});
