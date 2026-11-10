import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { createPGlite } from '../../test/pglite.js';
import {
  SalesReportService,
  UNCATEGORIZED_KEY,
} from './sales-report.service.js';

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
    items: unknown[] | null = null,
  ) =>
    client.query(
      `insert into refund (id, order_id, amount, scope, channel, status, created_at, items)
       values ($1, $2, $3, 'partial', 'manual', $4, $5::timestamptz at time zone 'UTC', $6)`,
      [id, orderId, amount, status, createdAt, items && JSON.stringify(items)],
    );

  const addOrderItem = (
    id: string,
    orderId: string,
    menuItemId: string,
    menuItemName: string,
    orderQuantity: number,
    unitPrice: number,
    addOns: unknown[] = [],
    discount: number | null = null,
  ) =>
    client.query(
      `insert into order_item (id, order_id, menu_item_id, menu_item_name, order_quantity, unit_price, add_ons, discount)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        orderId,
        menuItemId,
        menuItemName,
        orderQuantity,
        unitPrice,
        JSON.stringify(addOns),
        discount,
      ],
    );

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new SalesReportService(db as unknown as DrizzleDB);

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('cents', 'Cents', 'cents', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('items', 'Items', 'items', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('lines', 'Lines', 'lines', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('refunds', 'Refunds', 'refunds', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into menu (id, organization_id, name) values ('menu', 'items', '{"zh-TW":"菜單"}');
       insert into menu_section (id, menu_id, parent_section_id, name) values
         ('coffee', 'menu', null, '{"zh-TW":"咖啡"}'),
         ('extras', 'menu', 'coffee', '{"zh-TW":"加料"}');
       insert into menu_item (id, menu_id, menu_section_id, name) values
         ('latte', 'menu', 'coffee', '{"zh-TW":"拿鐵","en":"Latte"}'),
         ('oat', 'menu', 'extras', '{"zh-TW":"燕麥奶"}'),
         ('cake', 'menu', null, '{"zh-TW":"蛋糕"}');`,
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

    await addOrder('items-a', {
      discount: 30,
      sellerId: 'items',
      subtotal: 300,
    });
    await addOrderItem('items-a-latte', 'items-a', 'latte', '拿鐵', 2, 120, [
      {
        menuItemId: 'oat',
        menuItemName: '燕麥奶',
        unitPrice: '15.00',
        modifiers: [{ priceAdjustment: '5.00' }],
      },
    ]);
    await addOrderItem('items-a-cake', 'items-a', 'cake', '蛋糕', 1, 60);
    await addOrder('items-b', { sellerId: 'items', subtotal: 50 });
    await addOrderItem('items-b-gone', 'items-b', 'gone', '已下架', 1, 50);
    await addRefund(
      'items-refund',
      'items-a',
      108,
      '2026-10-02T03:00:00Z',
      'refunded',
      [{ orderItemId: 'items-a-latte', quantity: 1, amount: '120' }],
    );
    await addRefund(
      'items-pending-refund',
      'items-a',
      54,
      '2026-10-02T03:00:00Z',
      'pending',
      [{ orderItemId: 'items-a-cake', quantity: 1, amount: '60' }],
    );

    const addLineDiscountOrder = async (id: string, sellerId: string) => {
      await addOrder(id, { discount: 30, sellerId, subtotal: 300 });
      await addOrderItem(
        `${id}-latte`,
        id,
        'latte',
        '拿鐵',
        2,
        120,
        [
          {
            menuItemId: 'oat',
            menuItemName: '燕麥奶',
            unitPrice: '15.00',
            modifiers: [{ priceAdjustment: '5.00' }],
          },
        ],
        0,
      );
      await addOrderItem(`${id}-cake`, id, 'cake', '蛋糕', 1, 60, [], 30);
    };
    await addLineDiscountOrder('lines-a', 'lines');
    await addOrder('lines-old', {
      discount: 10,
      sellerId: 'lines',
      subtotal: 100,
    });
    await addOrderItem('lines-old-latte', 'lines-old', 'latte', '拿鐵', 1, 50);
    await addOrderItem('lines-old-cake', 'lines-old', 'cake', '蛋糕', 1, 50);
    await addOrder('lines-mixed', {
      discount: 10,
      sellerId: 'lines',
      subtotal: 100,
    });
    await addOrderItem(
      'lines-mixed-latte',
      'lines-mixed',
      'latte',
      '拿鐵',
      1,
      50,
      [],
      3,
    );
    await addOrderItem(
      'lines-mixed-cake',
      'lines-mixed',
      'cake',
      '蛋糕',
      1,
      50,
    );

    await addLineDiscountOrder('refunds-full', 'refunds');
    await addRefund(
      'refunds-full-refund',
      'refunds-full',
      270,
      '2026-10-02T03:00:00Z',
      'refunded',
      [
        { orderItemId: 'refunds-full-latte', quantity: 2, amount: '240' },
        { orderItemId: 'refunds-full-cake', quantity: 1, amount: '60' },
      ],
    );
    await addLineDiscountOrder('refunds-cake', 'refunds');
    await addRefund(
      'refunds-cake-refund',
      'refunds-cake',
      30,
      '2026-10-02T03:00:00Z',
      'refunded',
      [{ orderItemId: 'refunds-cake-cake', quantity: 1, amount: '60' }],
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

  it('依品項分組時整單折扣依小計分攤、退款依退款明細分攤，加購計入加購品項', async () => {
    await expect(
      service.getSalesReport('items', { ...range, groupBy: 'menuItem' }),
    ).resolves.toEqual({
      groupBy: 'menuItem',
      rows: [
        {
          key: 'latte',
          name: { 'zh-TW': '拿鐵', en: 'Latte' },
          orders: 1,
          quantity: 2,
          refundedQuantity: 1,
          revenue: 180,
          discount: 20,
          refunded: 90,
          net: 90,
        },
        {
          key: 'cake',
          name: { 'zh-TW': '蛋糕' },
          orders: 1,
          quantity: 1,
          refundedQuantity: 0,
          revenue: 54,
          discount: 6,
          refunded: 0,
          net: 54,
        },
        {
          key: 'gone',
          name: { 'zh-TW': '已下架' },
          orders: 1,
          quantity: 1,
          refundedQuantity: 0,
          revenue: 50,
          discount: 0,
          refunded: 0,
          net: 50,
        },
        {
          key: 'oat',
          name: { 'zh-TW': '燕麥奶' },
          orders: 1,
          quantity: 2,
          refundedQuantity: 1,
          revenue: 36,
          discount: 4,
          refunded: 18,
          net: 18,
        },
      ],
      totals: {
        orders: 2,
        revenue: 320,
        discount: 30,
        refunded: 108,
        net: 212,
      },
    });
  });

  it('依品項目前所屬的菜單分類分組，找不到分類的歸為未分類', async () => {
    const { rows } = await service.getSalesReport('items', {
      ...range,
      groupBy: 'category',
    });

    expect(
      rows.map(({ key, name, orders, quantity, net }) => [
        key,
        name,
        orders,
        quantity,
        net,
      ]),
    ).toEqual([
      ['coffee', { 'zh-TW': '咖啡' }, 1, 2, 90],
      [UNCATEGORIZED_KEY, null, 2, 2, 104],
      ['extras', { 'zh-TW': '加料' }, 1, 2, 18],
    ]);
  });

  it('每行都有記錄折扣的訂單依各行折扣歸屬，有任一行沒記錄的訂單仍依小計分攤', async () => {
    const { rows, totals } = await service.getSalesReport('lines', {
      ...range,
      groupBy: 'menuItem',
    });

    expect(
      rows.map(({ key, revenue, discount }) => [key, revenue, discount]),
    ).toEqual([
      ['latte', 290, 10],
      ['cake', 120, 40],
      ['oat', 40, 0],
    ]);
    expect(totals).toMatchObject({ revenue: 450, discount: 50 });

    const { rows: categories } = await service.getSalesReport('lines', {
      ...range,
      groupBy: 'category',
    });

    expect(
      categories.map(({ key, revenue, discount }) => [key, revenue, discount]),
    ).toEqual([
      ['coffee', 290, 10],
      [UNCATEGORIZED_KEY, 120, 40],
      ['extras', 40, 0],
    ]);
  });

  it('每行都有記錄折扣的訂單，退款依各行扣掉自身折扣後的金額分攤', async () => {
    const { rows, totals } = await service.getSalesReport('refunds', {
      ...range,
      groupBy: 'menuItem',
    });

    expect(
      rows.map(({ key, revenue, discount, refunded, net }) => [
        key,
        revenue,
        discount,
        refunded,
        net,
      ]),
    ).toEqual([
      ['latte', 400, 0, 200, 200],
      ['oat', 80, 0, 40, 40],
      ['cake', 60, 60, 60, 0],
    ]);
    expect(totals).toEqual({
      orders: 2,
      revenue: 540,
      discount: 60,
      refunded: 300,
      net: 240,
    });
  });

  it('結束時間不晚於起始時間時拒絕', async () => {
    await expect(
      service.getSalesReport('biru', {
        since: range.since,
        until: range.since,
        groupBy: 'day',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'rangeInvalid' },
    });
  });

  it('區間超過 366 天時拒絕', async () => {
    await expect(
      service.getSalesReport('biru', {
        since: '2026-01-01T00:00:00+08:00',
        until: '2027-01-03T00:00:00+08:00',
        groupBy: 'mode',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'rangeTooLong' },
    });
  });

  it('門市不存在時回 404 並帶 organizationNotFound', async () => {
    await expect(
      service.getSalesReport('missing', { ...range, groupBy: 'day' }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'organizationNotFound' },
    });
  });
});
