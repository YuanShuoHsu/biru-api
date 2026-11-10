import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import { ingredient, supplier } from '../db/schema/inventory.js';
import { order, orderItem, type OrderStatus } from '../db/schema/orders.js';
import { member } from '../db/schema/organizations.js';
import { pointTransaction } from '../db/schema/points.js';
import { refund } from '../db/schema/refunds.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { MailsService } from '../mails/mails.service.js';

import { MenuItemSalesService } from './menu-item-sales.service.js';
import { OrderNotificationsService } from './order-notifications.service.js';
import { OrderStatsService } from './order-stats.service.js';

const NOW = new Date('2026-10-23T02:00:00Z');
const YESTERDAY_START = new Date('2026-10-21T16:00:00Z');

describe('OrderNotificationsService.notifyDailySalesDigest', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const sendDailySalesDigest = vi.fn();
  let service: OrderNotificationsService;

  const insertOrder = async (
    id: string,
    sellerId: string,
    paymentDate: string,
    items: { menuItemId: string; quantity: number; unitPrice: number }[],
    orderStatus: OrderStatus = 'OrderDelivered',
  ) => {
    await db.insert(order).values({
      id,
      customer: { name: id },
      mode: 'counter',
      orderNumber: id,
      orderStatus,
      paymentDate: new Date(paymentDate),
      paymentMethod: 'Cash',
      sellerId,
      subtotal: String(
        items.reduce(
          (sum, { quantity, unitPrice }) => sum + quantity * unitPrice,
          0,
        ),
      ),
    });
    await db.insert(orderItem).values(
      items.map(({ menuItemId, quantity, unitPrice }, index) => ({
        id: `${id}-${index}`,
        menuItemId,
        menuItemName: menuItemId,
        orderId: id,
        orderQuantity: quantity,
        unitPrice: String(unitPrice),
      })),
    );
  };

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    const drizzleDb = db as unknown as DrizzleDB;
    service = new OrderNotificationsService(
      drizzleDb,
      { sendDailySalesDigest } as unknown as MailsService,
      new MenuItemSalesService(drizzleDb),
      new OrderStatsService(drizzleDb),
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    sendDailySalesDigest.mockReset().mockResolvedValue(undefined);
    await client.exec('truncate "order", organization, "user" cascade');
    for (const [id, slug] of [
      ['org', 'biru'],
      ['other', 'other'],
    ])
      await client.query(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, $2, $2, now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
        [id, slug],
      );
    for (const [id, lang] of [
      ['owner', 'en'],
      ['admin', 'zh-TW'],
      ['staff', 'zh-TW'],
      ['otherOwner', 'zh-TW'],
    ])
      await client.query(
        `insert into "user" (id, name, email, first_name, lang) values ($1, $1, $1 || '@example.com', $1, $2)`,
        [id, lang],
      );
    await db.insert(member).values(
      (
        [
          ['owner', 'org', 'owner'],
          ['admin', 'org', 'admin'],
          ['staff', 'org', 'member'],
          ['otherOwner', 'other', 'owner'],
        ] as const
      ).map(([userId, organizationId, role]) => ({
        id: userId,
        organizationId,
        userId,
        role,
        createdAt: NOW,
      })),
    );

    await insertOrder('o1', 'org', '2026-10-22T06:30:00Z', [
      { menuItemId: 'latte', quantity: 2, unitPrice: 100 },
    ]);
    await insertOrder('o2', 'org', '2026-10-22T06:50:00Z', [
      { menuItemId: 'mocha', quantity: 1, unitPrice: 100 },
    ]);
    await insertOrder('o3', 'org', '2026-10-21T05:00:00Z', [
      { menuItemId: 'latte', quantity: 1, unitPrice: 150 },
    ]);
    await insertOrder(
      'unpaid',
      'org',
      '2026-10-22T07:00:00Z',
      [{ menuItemId: 'latte', quantity: 5, unitPrice: 100 }],
      'OrderPaymentDue',
    );
    await insertOrder('older', 'other', '2026-10-20T06:00:00Z', [
      { menuItemId: 'latte', quantity: 1, unitPrice: 100 },
    ]);
  });

  it('只寄給昨天有營業門市中可看營收的 owner／admin，內容為店家時區昨天的統計', async () => {
    const notified = await service.notifyDailySalesDigest(NOW);

    expect(notified).toBe(2);
    expect(
      sendDailySalesDigest.mock.calls
        .map(([{ recipient }]) => recipient.email)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(['admin@example.com', 'owner@example.com']);

    const [digest] = sendDailySalesDigest.mock.calls[0];
    expect(digest).toMatchObject({
      organizationName: 'biru',
      currency: 'TWD',
      date: YESTERDAY_START,
      path: '/dashboard?organization=biru&range=yesterday',
      current: { orders: 2, revenue: 300 },
      previous: { orders: 1, revenue: 150 },
      peakHour: { hour: 14, orders: 2 },
      refundedOrders: 0,
      topItems: [
        { name: 'latte', sold: 2 },
        { name: 'mocha', sold: 1 },
      ],
    });
  });

  it('昨日的人工補扣點只列在寄給 owner 的摘要裡', async () => {
    await db.insert(pointTransaction).values([
      {
        id: 'adjust-1',
        adjustedBy: 'admin',
        createdAt: new Date('2026-10-21T16:30:00Z'),
        note: '補登漏掉的點數',
        organizationId: 'org',
        points: 50,
        type: 'adjust',
        userId: 'staff',
      },
      {
        id: 'adjust-2',
        adjustedBy: 'owner',
        createdAt: new Date('2026-10-22T15:59:00Z'),
        note: '誤發收回',
        organizationId: 'org',
        points: -20,
        type: 'adjust',
        userId: 'staff',
      },
      {
        id: 'adjust-before-midnight',
        adjustedBy: 'admin',
        createdAt: new Date('2026-10-21T15:59:00Z'),
        note: '前一天',
        organizationId: 'org',
        points: 10,
        type: 'adjust',
        userId: 'staff',
      },
      {
        id: 'adjust-after-midnight',
        adjustedBy: 'admin',
        createdAt: new Date('2026-10-22T16:00:00Z'),
        note: '今天',
        organizationId: 'org',
        points: 10,
        type: 'adjust',
        userId: 'staff',
      },
    ]);

    await service.notifyDailySalesDigest(NOW);

    const digests = Object.fromEntries(
      sendDailySalesDigest.mock.calls.map(([digest]) => [
        digest.recipient.email,
        digest,
      ]),
    );
    expect(digests['owner@example.com'].pointAdjustments).toEqual([
      {
        adjuster: 'admin',
        member: 'staff',
        points: 50,
        reason: '補登漏掉的點數',
      },
      { adjuster: 'owner', member: 'staff', points: -20, reason: '誤發收回' },
    ]);
    expect(digests['admin@example.com'].pointAdjustments).toEqual([]);
  });

  it('昨天沒有訂單但有人工補扣點時，只寄給 owner', async () => {
    await db.insert(pointTransaction).values({
      id: 'adjust-other',
      adjustedBy: 'otherOwner',
      createdAt: new Date('2026-10-22T03:00:00Z'),
      note: '活動補點',
      organizationId: 'other',
      points: 30,
      type: 'adjust',
      userId: 'staff',
    });
    await db.insert(member).values({
      id: 'otherAdmin',
      organizationId: 'other',
      userId: 'admin',
      role: 'admin',
      createdAt: NOW,
    });

    await service.notifyDailySalesDigest(NOW);

    const other = sendDailySalesDigest.mock.calls
      .map(([digest]) => digest)
      .filter(({ organizationName }) => organizationName === 'other');
    expect(other).toHaveLength(1);
    expect(other[0]).toMatchObject({
      recipient: { email: 'otherOwner@example.com' },
      current: { orders: 0 },
      pointAdjustments: [{ adjuster: 'otherOwner', points: 30 }],
    });
  });

  it('不寄給停權中的帳號', async () => {
    await client.exec(`update "user" set banned = true where id = 'admin'`);

    await service.notifyDailySalesDigest(NOW);

    expect(
      sendDailySalesDigest.mock.calls.map(([{ recipient }]) => recipient.email),
    ).toEqual(['owner@example.com']);
  });

  it('單一收件人寄送失敗時，其他收件人照常寄出', async () => {
    sendDailySalesDigest.mockRejectedValueOnce(new Error('smtp'));

    const notified = await service.notifyDailySalesDigest(NOW);

    expect(notified).toBe(1);
    expect(sendDailySalesDigest).toHaveBeenCalledTimes(2);
  });

  it('昨天沒有計入的訂單時不寄信', async () => {
    const notified = await service.notifyDailySalesDigest(
      new Date('2026-10-25T02:00:00Z'),
    );

    expect(notified).toBe(0);
    expect(sendDailySalesDigest).not.toHaveBeenCalled();
  });
});

describe('OrderNotificationsService.notifyPlatformDailyDigest', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const sendPlatformDailyDigest = vi.fn();
  let orderStats: OrderStatsService;
  let service: OrderNotificationsService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    const drizzleDb = db as unknown as DrizzleDB;
    orderStats = new OrderStatsService(drizzleDb);
    service = new OrderNotificationsService(
      drizzleDb,
      { sendPlatformDailyDigest } as unknown as MailsService,
      new MenuItemSalesService(drizzleDb),
      orderStats,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    sendPlatformDailyDigest.mockReset().mockResolvedValue(undefined);
    await client.exec('truncate "order", organization, "user" cascade');
    for (const [id, slug] of [
      ['org', 'biru'],
      ['other', 'other'],
      ['quiet', 'quiet'],
    ])
      await client.query(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, $2, $2, now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
        [id, slug],
      );
    for (const [id, role, banned, banExpires, lang] of [
      ['root', 'admin', false, null, 'zh-TW'],
      ['bannedRoot', 'admin', true, null, 'zh-TW'],
      ['unbannedRoot', 'admin', true, '2026-10-22T00:00:00Z', 'en'],
      ['owner', 'user', false, null, 'zh-TW'],
      ['customer', 'user', false, null, 'zh-TW'],
    ] as const)
      await client.query(
        `insert into "user" (id, name, email, first_name, lang, role, banned, ban_expires) values ($1, $1, $1 || '@example.com', $1, $5, $2, $3, $4)`,
        [id, role, banned, banExpires, lang],
      );
    await db.insert(member).values({
      id: 'owner',
      organizationId: 'org',
      userId: 'owner',
      role: 'owner',
      createdAt: NOW,
    });
    await db.insert(order).values(
      [
        ['o1', '2026-10-22T06:30:00Z', '200'],
        ['o2', '2026-10-22T06:50:00Z', '100'],
        ['older', '2026-10-21T05:00:00Z', '150'],
      ].map(([id, paymentDate, subtotal]) => ({
        id,
        customer: { name: id },
        mode: 'counter' as const,
        orderNumber: id,
        orderStatus: 'OrderDelivered' as const,
        paymentDate: new Date(paymentDate),
        paymentMethod: 'Cash' as const,
        sellerId: 'org',
        subtotal,
      })),
    );
    await db.insert(orderItem).values(
      [
        ['o1', 'latte', 2],
        ['o2', 'mocha', 1],
      ].map(([orderId, menuItemId, quantity]) => ({
        id: `${orderId}-item`,
        menuItemId: String(menuItemId),
        menuItemName: String(menuItemId),
        orderId: String(orderId),
        orderQuantity: Number(quantity),
        unitPrice: '100',
      })),
    );
    await db.insert(refund).values({
      id: 'refund-o2',
      orderId: 'o2',
      amount: '100',
      scope: 'full',
      channel: 'manual',
      status: 'refunded',
      createdAt: new Date('2026-10-22T08:00:00Z'),
    });
    await db.insert(pointTransaction).values(
      (
        [
          ['adjust-1', 50, '2026-10-22T03:00:00Z', '補登漏掉的點數'],
          ['adjust-2', -20, '2026-10-22T04:00:00Z', null],
        ] as const
      ).map(([id, points, createdAt, note]) => ({
        id,
        adjustedBy: 'owner',
        createdAt: new Date(createdAt),
        note,
        organizationId: 'org',
        points,
        type: 'adjust' as const,
        userId: 'customer',
      })),
    );
    await db.insert(supplier).values({
      id: 'dairy',
      name: '鮮奶坊',
      organizationId: 'other',
    });
    await db.insert(ingredient).values(
      (
        [
          ['milk', 'other', '100', 'dairy'],
          ['beans', 'other', '900', null],
          ['quietBeans', 'quiet', '900', null],
        ] as const
      ).map(([id, organizationId, inventoryLevel, supplierId]) => ({
        id,
        inventoryLevel,
        lowStockThreshold: '500',
        name: { 'zh-TW': `${id}（中）`, en: id },
        organizationId,
        supplierId,
        unitCode: 'GRM' as const,
      })),
    );
  });

  it('每位未停權的平台管理員收到一封含所有有資料門市的總覽', async () => {
    const notified = await service.notifyPlatformDailyDigest(NOW);

    expect(notified).toBe(2);
    expect(
      sendPlatformDailyDigest.mock.calls
        .map(([{ recipient }]) => recipient.email)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(['root@example.com', 'unbannedRoot@example.com']);
    expect(
      sendPlatformDailyDigest.mock.calls.find(
        ([{ recipient }]) => recipient.email === 'root@example.com',
      )![0],
    ).toEqual({
      recipient: { email: 'root@example.com', lang: 'zh-TW' },
      date: YESTERDAY_START,
      path: '/organizations',
      stores: [
        {
          organizationName: 'biru',
          currency: 'TWD',
          path: '/dashboard?organization=biru&range=yesterday',
          sales: {
            current: { orders: 2, revenue: 200 },
            previous: { orders: 1, revenue: 150 },
            peakHour: { hour: 14, orders: 2 },
            refundedOrders: 1,
            topItems: [
              { name: 'latte', sold: 2 },
              { name: 'mocha', sold: 1 },
            ],
          },
          pointAdjustments: [
            {
              adjuster: 'owner',
              member: 'customer',
              points: 50,
              reason: '補登漏掉的點數',
            },
            {
              adjuster: 'owner',
              member: 'customer',
              points: -20,
              reason: null,
            },
          ],
          lowStock: [],
        },
        {
          organizationName: 'other',
          currency: 'TWD',
          path: '/dashboard?organization=other&range=yesterday',
          sales: {
            current: { orders: 0, revenue: 0 },
            previous: { orders: 0, revenue: 0 },
            peakHour: { hour: 0, orders: 0 },
            refundedOrders: 0,
            topItems: [],
          },
          pointAdjustments: [],
          lowStock: [
            {
              name: 'milk（中）',
              inventoryLevel: '100.000',
              lowStockThreshold: '500.000',
              unitCode: 'GRM',
              supplierName: '鮮奶坊',
            },
          ],
        },
      ],
    });
    expect(
      sendPlatformDailyDigest.mock.calls.find(
        ([{ recipient }]) => recipient.email === 'unbannedRoot@example.com',
      )![0].stores[1].lowStock[0].name,
    ).toBe('milk');
  });

  it('門市統計失敗時仍列入該店的點數調整與低庫存，營業統計記為無法取得', async () => {
    vi.spyOn(orderStats, 'getStats').mockRejectedValue(new Error('stats'));

    await service.notifyPlatformDailyDigest(NOW);

    const [biru, other] = sendPlatformDailyDigest.mock.calls[0][0].stores;
    expect(biru).toMatchObject({
      organizationName: 'biru',
      sales: null,
      pointAdjustments: [{ points: 50 }, { points: -20 }],
    });
    expect(other).toMatchObject({
      organizationName: 'other',
      sales: null,
      lowStock: [{ supplierName: '鮮奶坊' }],
    });
  });

  it('單一門市統計失敗時，其他門市的營業統計照常列入', async () => {
    const getStats = orderStats.getStats.bind(orderStats);
    vi.spyOn(orderStats, 'getStats').mockImplementation((slug, ...rest) =>
      slug === 'biru'
        ? Promise.reject(new Error('stats'))
        : getStats(slug, ...rest),
    );

    await service.notifyPlatformDailyDigest(NOW);

    const [biru, other] = sendPlatformDailyDigest.mock.calls[0][0].stores;
    expect(biru.sales).toBeNull();
    expect(other.sales).toMatchObject({ current: { orders: 0, revenue: 0 } });
  });

  it('不限量的食材不算低庫存，不會讓門市列入總覽', async () => {
    await client.exec(
      `truncate "order", point_transaction cascade;
       update ingredient set unlimited_stock = true;`,
    );

    const notified = await service.notifyPlatformDailyDigest(NOW);

    expect(notified).toBe(0);
    expect(sendPlatformDailyDigest).not.toHaveBeenCalled();
  });

  it('沒有任何門市有資料時不寄信', async () => {
    await client.exec(
      'truncate "order", point_transaction, ingredient cascade',
    );

    const notified = await service.notifyPlatformDailyDigest(NOW);

    expect(notified).toBe(0);
    expect(sendPlatformDailyDigest).not.toHaveBeenCalled();
  });

  it('沒有平台管理員時不寄信', async () => {
    await client.exec(`update "user" set role = 'user' where role = 'admin'`);

    const notified = await service.notifyPlatformDailyDigest(NOW);

    expect(notified).toBe(0);
    expect(sendPlatformDailyDigest).not.toHaveBeenCalled();
  });
});
