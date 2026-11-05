import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { Logger } from '@nestjs/common';
import { eq, isNotNull, lt } from 'drizzle-orm';
import type { I18nService } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';
import { DAY_MS, platformMidnight } from '../common/constants/timezone.js';
import * as schema from '../db/schema/index.js';
import { order } from '../db/schema/orders.js';
import { pointTransaction } from '../db/schema/points.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import type { MailsService } from '../mails/mails.service.js';
import { POINTS_SNAPSHOT_SET } from '../orders/points-snapshot.js';

import { PointsService } from './points.service.js';

const USER = 'user';

describe('PointsService.getAllMine', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: PointsService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new PointsService(
      db as unknown as DrizzleDB,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
      {} as MailsService,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate point_transaction, "user" cascade');
    await client.query(
      `insert into "user" (id, name, email, first_name) values ($1, '王小明', 'a@example.com', '小明')`,
      [USER],
    );
  });

  const addTransactions = (
    rows: Partial<typeof pointTransaction.$inferInsert>[],
  ) =>
    db.insert(pointTransaction).values(
      rows.map((row, index) => ({
        id: `t${index}`,
        createdAt: new Date(Date.UTC(2026, 0, 1 + index)),
        points: 10,
        remainingPoints: 10,
        type: 'earn' as const,
        userId: USER,
        ...row,
      })),
    );

  it('分頁只取當頁明細，總數與餘額仍以全部明細計算', async () => {
    await addTransactions([
      {},
      { remainingPoints: 4 },
      { expiresAt: new Date('2020-01-01T00:00:00Z') },
      { expiresAt: new Date('2999-01-01T00:00:00Z') },
      { points: -6, remainingPoints: 0, type: 'redeem' },
      { points: -3, remainingPoints: -3, type: 'revoke' },
      {
        expiresAt: new Date('2020-01-01T00:00:00Z'),
        points: -5,
        remainingPoints: -5,
        type: 'revoke',
      },
    ]);

    const result = await service.getAllMine(USER, { limit: 2, offset: 1 });

    expect(result.transactions.map(({ id }) => id)).toEqual(['t5', 't4']);
    expect(result.transactionsTotal).toBe(7);
    expect(result.balance).toBe(16);
  });

  it('同一時間建立的明細依 id 排序，翻頁不重複也不遺漏', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    await addTransactions([{ createdAt }, { createdAt }, { createdAt }]);

    const pages = await Promise.all(
      [0, 1, 2].map((offset) => service.getAllMine(USER, { limit: 1, offset })),
    );

    expect(
      pages.flatMap((page) => page.transactions.map(({ id }) => id)),
    ).toEqual(['t2', 't1', 't0']);
  });

  it('沒有明細時餘額與總數為 0', async () => {
    await expect(service.getAllMine(USER)).resolves.toMatchObject({
      balance: 0,
      transactions: [],
      transactionsTotal: 0,
      expiringSoon: [],
    });
  });

  describe('expiringSoon', () => {
    const inPlatformDays = (days: number, hours: number) =>
      new Date(platformMidnight(Date.now()) + days * DAY_MS + hours * 3600_000);

    it('30 天內到期的剩餘點數依台灣日期分組，取當天最早到期時間，由近到遠排列', async () => {
      await addTransactions([
        { expiresAt: inPlatformDays(12, 9), remainingPoints: 7 },
        { expiresAt: inPlatformDays(5, 18), remainingPoints: 4 },
        { expiresAt: inPlatformDays(5, 2) },
        {
          expiresAt: inPlatformDays(5, 3),
          points: 6,
          remainingPoints: 6,
          type: 'adjust',
        },
        { expiresAt: inPlatformDays(30, 23), remainingPoints: 2 },
      ]);

      const { expiringSoon } = await service.getAllMine(USER);

      expect(expiringSoon).toEqual([
        { expiresAt: inPlatformDays(5, 2), points: 20 },
        { expiresAt: inPlatformDays(12, 9), points: 7 },
        { expiresAt: inPlatformDays(30, 23), points: 2 },
      ]);
    });

    it('同一天到期的收回點數從當天扣除', async () => {
      const expiresAt = inPlatformDays(5, 2);
      await addTransactions([
        { expiresAt },
        { expiresAt, points: -3, remainingPoints: -3, type: 'revoke' },
      ]);

      const { expiringSoon } = await service.getAllMine(USER);

      expect(expiringSoon).toEqual([{ expiresAt, points: 7 }]);
    });

    it('收回造成的欠點使合計超過餘額時，從最近到期的日期起只列到餘額為止', async () => {
      await addTransactions([
        { expiresAt: inPlatformDays(3, 2), points: 20, remainingPoints: 20 },
        { expiresAt: inPlatformDays(8, 2) },
        { expiresAt: null, points: -15, remainingPoints: -15, type: 'revoke' },
      ]);

      const { balance, expiringSoon } = await service.getAllMine(USER);

      expect(balance).toBe(15);
      expect(expiringSoon).toEqual([
        { expiresAt: inPlatformDays(3, 2), points: 15 },
      ]);
    });

    it('不含第 31 天起、已過期、不會過期、已用完、只有收回與其他會員的點數', async () => {
      await client.query(
        `insert into "user" (id, name, email, first_name) values ('other', '陳小華', 'b@example.com', '小華')`,
      );
      await addTransactions([
        { expiresAt: inPlatformDays(31, 0) },
        { expiresAt: new Date(Date.now() - 60_000) },
        { expiresAt: null },
        { expiresAt: inPlatformDays(5, 4), remainingPoints: 0 },
        {
          expiresAt: inPlatformDays(5, 5),
          points: -3,
          remainingPoints: -3,
          type: 'revoke',
        },
        { expiresAt: inPlatformDays(5, 6), userId: 'other' },
      ]);

      const { expiringSoon } = await service.getAllMine(USER);

      expect(expiringSoon).toEqual([]);
    });
  });
});

describe('PointsService.notifyExpiringPoints', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: PointsService;
  const sendPointsExpiryReminder =
    vi.fn<MailsService['sendPointsExpiryReminder']>();

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new PointsService(
      db as unknown as DrizzleDB,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
      { sendPointsExpiryReminder } as unknown as MailsService,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    sendPointsExpiryReminder.mockReset().mockResolvedValue(true);
    await client.exec('truncate point_transaction, "user" cascade');
    for (const id of [USER, 'other'])
      await client.query(
        `insert into "user" (id, name, email, first_name) values ($1, $1, $1 || '@example.com', $1)`,
        [id],
      );
  });

  const inPlatformDays = (days: number, hours: number) =>
    new Date(platformMidnight(Date.now()) + days * DAY_MS + hours * 3600_000);

  const addTransactions = (
    rows: Partial<typeof pointTransaction.$inferInsert>[],
  ) =>
    db.insert(pointTransaction).values(
      rows.map((row, index) => ({
        id: `t${index}`,
        points: 10,
        remainingPoints: 10,
        type: 'earn' as const,
        userId: USER,
        ...row,
      })),
    );

  const remindedIds = async () =>
    (
      await db
        .select({ id: pointTransaction.id })
        .from(pointTransaction)
        .where(isNotNull(pointTransaction.expiryRemindedAt))
        .orderBy(pointTransaction.id)
    ).map(({ id }) => id);

  it('提醒第 24～30 個台灣日到期的點數，一個到期日一封，依當天加總、取當天最早到期時間', async () => {
    const endOfPlatformDay = (days: number) =>
      new Date(inPlatformDays(days + 1, 0).getTime() - 1);
    await addTransactions([
      { expiresAt: endOfPlatformDay(23) },
      { expiresAt: inPlatformDays(24, 0) },
      { expiresAt: endOfPlatformDay(30), remainingPoints: 4 },
      { expiresAt: inPlatformDays(30, 1) },
      { expiresAt: inPlatformDays(31, 0) },
    ]);

    await expect(service.notifyExpiringPoints()).resolves.toBe(2);

    expect(sendPointsExpiryReminder.mock.calls).toEqual([
      [{ userId: USER, expiresAt: inPlatformDays(24, 0), points: 10 }],
      [{ userId: USER, expiresAt: inPlatformDays(30, 1), points: 14 }],
    ]);
    expect(await remindedIds()).toEqual(['t1', 't2', 't3']);
  });

  it('已提醒過的點數再跑一次不再寄', async () => {
    await addTransactions([{ expiresAt: inPlatformDays(30, 1) }]);

    await service.notifyExpiringPoints();
    await expect(service.notifyExpiringPoints()).resolves.toBe(0);

    expect(sendPointsExpiryReminder).toHaveBeenCalledOnce();
  });

  it('已用完或被當天收回扣光的點數不寄', async () => {
    await addTransactions([
      { expiresAt: inPlatformDays(30, 1), remainingPoints: 0 },
      { expiresAt: inPlatformDays(30, 2), userId: 'other' },
      {
        expiresAt: inPlatformDays(30, 3),
        points: -10,
        remainingPoints: -10,
        type: 'revoke',
        userId: 'other',
      },
    ]);

    await expect(service.notifyExpiringPoints()).resolves.toBe(0);

    expect(sendPointsExpiryReminder).not.toHaveBeenCalled();
  });

  it('較早到期的點數先佔用餘額，提醒點數只到剩下的餘額為止', async () => {
    await addTransactions([
      { expiresAt: inPlatformDays(10, 1), points: 20, remainingPoints: 20 },
      { expiresAt: inPlatformDays(30, 1), points: 20, remainingPoints: 20 },
      { expiresAt: null, points: -15, remainingPoints: -15, type: 'revoke' },
    ]);

    await service.notifyExpiringPoints();

    expect(sendPointsExpiryReminder).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ points: 5 }),
    );
  });

  it('寄送失敗時不標記，隔天重跑會補寄原本的到期日', async () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    onTestFinished(() => error.mockRestore());
    const expiresAt = inPlatformDays(30, 1);
    await addTransactions([{ expiresAt }]);
    sendPointsExpiryReminder.mockRejectedValueOnce(new Error('smtp down'));

    await expect(service.notifyExpiringPoints()).resolves.toBe(0);
    expect(await remindedIds()).toEqual([]);

    vi.useFakeTimers({ toFake: ['Date'] });
    onTestFinished(() => vi.useRealTimers());
    vi.setSystemTime(Date.now() + DAY_MS);

    await expect(service.notifyExpiringPoints()).resolves.toBe(1);
    expect(sendPointsExpiryReminder).toHaveBeenLastCalledWith({
      userId: USER,
      expiresAt,
      points: 10,
    });
    expect(await remindedIds()).toEqual(['t0']);
  });
});

describe('PointsService.findAllForOrganization', () => {
  const ORG = 'org';
  const OTHER_ORG = 'other';

  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: PointsService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new PointsService(
      db as unknown as DrizzleDB,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
      {} as MailsService,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      'truncate point_transaction, order_item, "order", organization, "user" cascade',
    );
    for (const [id, slug] of [
      [ORG, 'biru'],
      [OTHER_ORG, 'other'],
    ])
      await client.query(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, $2, $2, now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
        [id, slug],
      );
    await client.exec(
      `update point_setting set amount_per_point = 10, points_enabled_at = '2026-01-01'`,
    );
    for (const [id, email] of [
      ['amy', 'amy@example.com'],
      ['bob', 'bob@example.com'],
    ])
      await client.query(
        `insert into "user" (id, name, email, first_name) values ($1, $1, $2, $1)`,
        [id, email],
      );
  });

  const addPaidOrder = async (
    id: string,
    sellerId: string,
    userId: string | null,
    {
      amountPerPoint = null as string | null,
      discount = null as string | null,
      orderStatus = 'OrderDelivered',
      paymentDate = '2026-02-01' as string | null,
      unitPrice = '100',
    } = {},
  ) => {
    await client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, payment_date, order_status, user_id, amount_per_point, discount)
       values ($1, '{"name":"客人"}', 'pickup', $1, 'Cash', $2, $6, $4, $7, $3, $5, $8)`,
      [
        id,
        sellerId,
        userId,
        paymentDate,
        amountPerPoint,
        unitPrice,
        orderStatus,
        discount,
      ],
    );
    await client.query(
      `insert into order_item (id, menu_item_id, menu_item_name, order_id, order_quantity, unit_price)
       values ($1, 'item', '拿鐵', $1, 1, $2)`,
      [id, unitPrice],
    );
  };

  it('列表前先為本店已付款的會員訂單補入點數，不含他店與訪客訂單', async () => {
    await addPaidOrder('o1', ORG, 'amy');
    await addPaidOrder('o2', ORG, null);
    await addPaidOrder('o3', OTHER_ORG, 'bob');

    const result = await service.findAllForOrganization('biru');

    expect(result.total).toBe(1);
    expect(result.data).toEqual([
      expect.objectContaining({
        orderNumber: 'o1',
        points: 10,
        type: 'earn',
        userEmail: 'amy@example.com',
      }),
    ]);
    expect(await db.select().from(pointTransaction)).toHaveLength(1);
  });

  it('啟用前付款且沒有快照的訂單不入點，有快照的訂單照快照入點', async () => {
    await addPaidOrder('o1', ORG, 'amy', { paymentDate: '2025-12-01' });
    await addPaidOrder('o2', ORG, 'amy', {
      amountPerPoint: '20',
      paymentDate: '2025-12-01',
    });

    const result = await service.findAllForOrganization('biru');

    expect(result.data).toEqual([
      expect.objectContaining({ orderNumber: 'o2', points: 5 }),
    ]);
  });

  it('點數自取得日起一年有效，到期時間是台灣時間那天的最後一刻', async () => {
    await addPaidOrder('o1', ORG, 'amy', { paymentDate: '2026-02-01' });
    await addPaidOrder('o2', ORG, 'amy', {
      paymentDate: '2026-02-01T17:00:00Z',
    });
    await addPaidOrder('o3', ORG, 'amy', { paymentDate: '2028-02-29' });

    const { data } = await service.findAllForOrganization('biru');

    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderNumber: 'o1',
          expiresAt: new Date('2027-02-01T15:59:59.999Z'),
        }),
        expect.objectContaining({
          orderNumber: 'o2',
          expiresAt: new Date('2027-02-02T15:59:59.999Z'),
        }),
        expect.objectContaining({
          orderNumber: 'o3',
          expiresAt: new Date('2029-02-28T15:59:59.999Z'),
        }),
      ]),
    );
  });

  it('補點自補點日起一年有效，扣點沒有到期日', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-04T03:30:00Z') });
    try {
      const added = await service.adjustForOrganization(
        'biru',
        { email: 'amy@example.com', note: '補償', points: 30 },
        'bob',
        'admin',
      );
      const deducted = await service.adjustForOrganization(
        'biru',
        { email: 'amy@example.com', note: '誤發', points: -10 },
        'bob',
        'admin',
      );

      expect(added.expiresAt).toEqual(new Date('2027-11-04T15:59:59.999Z'));
      expect(deducted.expiresAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('每點金額有小數時以整數分計算，不因浮點誤差少給一點', async () => {
    await addPaidOrder('o1', ORG, 'amy', {
      amountPerPoint: '1.1',
      unitPrice: '33',
    });
    await addPaidOrder('o2', ORG, 'amy', {
      amountPerPoint: '0.07',
      unitPrice: '7',
    });

    const result = await service.findAllForOrganization('biru');

    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orderNumber: 'o1', points: 30 }),
        expect.objectContaining({ orderNumber: 'o2', points: 100 }),
      ]),
    );
  });

  it('尚未入點的訂單部分退款時，以整數分算出應得點數再收回', async () => {
    await addPaidOrder('o1', ORG, 'amy', {
      amountPerPoint: '1.1',
      unitPrice: '33',
    });

    await service.revokeForOrder(db as unknown as DrizzleDB, {
      orderBecomesTerminal: false,
      orderId: 'o1',
      ratio: 1,
    });

    expect(await db.select().from(pointTransaction)).toEqual([
      expect.objectContaining({ points: -30, type: 'revoke' }),
    ]);
  });

  describe('多次退款累計收回', () => {
    const refund = (ratio: number, orderBecomesTerminal = false) =>
      service.revokeForOrder(db as unknown as DrizzleDB, {
        orderBecomesTerminal,
        orderId: 'o1',
        ratio,
      });

    const totalRevoked = async () =>
      (
        await db
          .select()
          .from(pointTransaction)
          .where(eq(pointTransaction.type, 'revoke'))
      ).reduce((total, row) => total - row.points, 0);

    it('1 點的訂單兩次退一半，只收回 1 點', async () => {
      await addPaidOrder('o1', ORG, 'amy', { unitPrice: '10' });
      await service.findAllForOrganization('biru');

      await refund(0.5);
      await refund(0.5);

      expect(await totalRevoked()).toBe(1);
    });

    it('5 點的訂單分 30%、30%、40% 退款，合計收回 5 點', async () => {
      await addPaidOrder('o1', ORG, 'amy', { unitPrice: '50' });
      await service.findAllForOrganization('biru');

      await refund(0.3);
      await refund(0.3);
      await refund(0.4);

      expect(await totalRevoked()).toBe(5);
    });

    it('部分退款後再全額退款，收回剩下全部點數', async () => {
      await addPaidOrder('o1', ORG, 'amy', { unitPrice: '50' });
      await service.findAllForOrganization('biru');

      await refund(0.5);
      await refund(0.5, true);

      expect(await totalRevoked()).toBe(5);
    });

    it('尚未入點的 1 點訂單兩次退一半，只收回 1 點', async () => {
      await addPaidOrder('o1', ORG, 'amy', { unitPrice: '10' });

      await refund(0.5);
      await refund(0.5);

      expect(await totalRevoked()).toBe(1);
    });
  });

  it('點數停用時，沒有快照的訂單不入點', async () => {
    await client.exec(
      `update point_setting set amount_per_point = null, points_enabled_at = null`,
    );
    await addPaidOrder('o1', ORG, 'amy');

    expect((await service.findAllForOrganization('biru')).total).toBe(0);
  });

  it('預估點數與實際入點同一算法：未付款用目前設定，已付款用快照', async () => {
    await client.exec(`update point_setting set amount_per_point = 1.1`);
    await addPaidOrder('unpaid', ORG, 'amy', {
      discount: '3',
      orderStatus: 'OrderPaymentDue',
      paymentDate: null,
      unitPrice: '36',
    });
    await addPaidOrder('paid', ORG, 'amy', {
      amountPerPoint: '0.07',
      unitPrice: '7',
    });

    const expected = await service.expectedPoints(['unpaid', 'paid']);

    expect(expected).toEqual(
      new Map([
        ['unpaid', 30],
        ['paid', 100],
      ]),
    );
    await db
      .update(order)
      .set({
        ...POINTS_SNAPSHOT_SET,
        orderStatus: 'OrderProcessing',
        paymentDate: new Date('2026-02-02T00:00:00Z'),
      })
      .where(eq(order.id, 'unpaid'));
    await service.findAllForOrganization('biru');

    const earned = await db.select().from(pointTransaction);
    expect(earned).toHaveLength(2);
    expect(earned).toEqual(
      expect.arrayContaining(
        [...expected].map(([orderId, points]) =>
          expect.objectContaining({ orderId, points }),
        ),
      ),
    );
  });

  it('訪客、已取消與點數停用時的未付款訂單沒有預估點數', async () => {
    await addPaidOrder('guest', ORG, null);
    await addPaidOrder('cancelled', ORG, 'amy', {
      orderStatus: 'OrderCancelled',
    });

    expect(await service.expectedPoints(['guest', 'cancelled'])).toEqual(
      new Map(),
    );

    await client.exec(`update point_setting set amount_per_point = null`);
    await addPaidOrder('unpaid', ORG, 'amy', {
      orderStatus: 'OrderPaymentDue',
      paymentDate: null,
    });

    expect(await service.expectedPoints(['unpaid'])).toEqual(new Map());
  });

  it('下單前預估點數與未付款訂單的預估一致', async () => {
    await client.exec(`update point_setting set amount_per_point = 1.1`);
    await addPaidOrder('unpaid', ORG, 'amy', {
      discount: '3',
      orderStatus: 'OrderPaymentDue',
      paymentDate: null,
      unitPrice: '36',
    });

    const expected = await service.expectedPoints(['unpaid']);

    expect(await service.estimatePoints(36, 3)).toBe(expected.get('unpaid'));
    expect(await service.estimatePoints(36, 0)).toBe(32);
  });

  it('優惠券折扣取整後超過小計時預估為 0 點而不是負數', async () => {
    await client.exec(`update point_setting set amount_per_point = 1`);
    await addPaidOrder('unpaid', ORG, 'amy', {
      discount: '36',
      orderStatus: 'OrderPaymentDue',
      paymentDate: null,
      unitPrice: '35.50',
    });

    expect((await service.expectedPoints(['unpaid'])).get('unpaid')).toBe(0);
    expect(await service.estimatePoints(35.5, 36)).toBe(0);
  });

  it('點數未啟用時下單前預估為 null', async () => {
    await client.exec(
      `update point_setting set amount_per_point = null, points_enabled_at = null`,
    );

    expect(await service.estimatePoints(36, 0)).toBeNull();
  });

  it('收回本店已取消訂單的點數，且不列出他店與品牌層的明細', async () => {
    await addPaidOrder('o1', ORG, 'amy');
    await addPaidOrder('o2', OTHER_ORG, 'amy');
    await service.findAllForOrganization('biru');
    await service.findAllForOrganization('other');
    await client.query(
      `update "order" set order_status = 'OrderCancelled' where id in ('o1', 'o2')`,
    );
    await db.insert(pointTransaction).values({
      id: 'redeem',
      points: -5,
      type: 'redeem',
      userId: 'amy',
    });

    const result = await service.findAllForOrganization('biru');

    expect(result.data).toEqual([]);
    expect(
      (await db.select().from(pointTransaction)).map(({ id }) => id),
    ).toContain('redeem');
    expect(
      await db
        .select()
        .from(pointTransaction)
        .where(eq(pointTransaction.organizationId, OTHER_ORG)),
    ).toHaveLength(1);
  });

  it('收回已取消訂單時，同時被兌換掉的點數也算進欠點', async () => {
    await addPaidOrder('o1', ORG, 'amy', { unitPrice: '1000' });
    await service.findAllForOrganization('biru');
    await client.query(
      `update point_transaction set remaining_points = 30 where order_id = 'o1'`,
    );
    await client.query(
      `update "order" set order_status = 'OrderCancelled' where id = 'o1'`,
    );
    const transaction = db.transaction.bind(db);
    const spy = vi
      .spyOn(db, 'transaction')
      .mockImplementationOnce(async (run, config) => {
        await client.query(
          `update point_transaction set remaining_points = 0 where order_id = 'o1'`,
        );
        return transaction(run, config);
      });
    onTestFinished(() => spy.mockRestore());

    await service.findAllForOrganization('biru');

    expect(
      await db
        .select({
          remainingPoints: pointTransaction.remainingPoints,
          type: pointTransaction.type,
        })
        .from(pointTransaction)
        .where(eq(pointTransaction.orderId, 'o1'))
        .orderBy(pointTransaction.type),
    ).toEqual([
      { remainingPoints: 0, type: 'earn' },
      { remainingPoints: -100, type: 'revoke' },
    ]);
  });

  it('同時收回兩次已取消訂單，部分使用的點數只扣一次', async () => {
    await addPaidOrder('o1', ORG, 'amy', { unitPrice: '1000' });
    await service.findAllForOrganization('biru');
    await client.query(
      `update point_transaction set remaining_points = 30 where order_id = 'o1'`,
    );
    await client.query(
      `update "order" set order_status = 'OrderCancelled' where id = 'o1'`,
    );

    await Promise.all([
      service.findAllForOrganization('biru'),
      service.findAllForOrganization('biru'),
    ]);

    expect(
      await db
        .select({
          remainingPoints: pointTransaction.remainingPoints,
          type: pointTransaction.type,
        })
        .from(pointTransaction)
        .where(eq(pointTransaction.orderId, 'o1'))
        .orderBy(pointTransaction.type),
    ).toEqual([
      { remainingPoints: 0, type: 'earn' },
      { remainingPoints: -70, type: 'revoke' },
    ]);
  });

  describe('欠點', () => {
    const spendAll = async (orderId: string) => {
      const [earn] = await db
        .select()
        .from(pointTransaction)
        .where(eq(pointTransaction.orderId, orderId));
      await db
        .update(pointTransaction)
        .set({ remainingPoints: 0 })
        .where(eq(pointTransaction.id, earn.id));
      await db.insert(pointTransaction).values({
        id: `redeem-${orderId}`,
        points: -earn.remainingPoints,
        type: 'redeem',
        userId: earn.userId,
      });
    };

    const remainingByType = (orderId: string) =>
      db
        .select({
          remainingPoints: pointTransaction.remainingPoints,
          type: pointTransaction.type,
        })
        .from(pointTransaction)
        .where(eq(pointTransaction.orderId, orderId))
        .orderBy(pointTransaction.type);

    const balanceAt = async (now: string) => {
      vi.useFakeTimers({ now: new Date(now), toFake: ['Date'] });
      try {
        return (await service.getAllMine('amy')).balance;
      } finally {
        vi.useRealTimers();
      }
    };

    it('已取消訂單的點數全部兌換掉時也收回，成為欠點且不重複收回', async () => {
      await addPaidOrder('o1', ORG, 'amy', { unitPrice: '1000' });
      await service.findAllForOrganization('biru');
      await spendAll('o1');
      await client.query(
        `update "order" set order_status = 'OrderCancelled' where id = 'o1'`,
      );

      expect((await service.getAllMine('amy')).balance).toBe(-100);
      expect((await service.getAllMine('amy')).balance).toBe(-100);
    });

    it('退款造成的欠點過了收回列的到期日仍計入餘額', async () => {
      await addPaidOrder('o1', ORG, 'amy', { unitPrice: '1000' });
      await service.findAllForOrganization('biru');
      await spendAll('o1');
      await service.revokeForOrder(db as unknown as DrizzleDB, {
        orderBecomesTerminal: true,
        orderId: 'o1',
        ratio: 1,
      });

      expect(await balanceAt('2027-03-01T00:00:00Z')).toBe(-100);
    });

    it('欠點從之後取得的點數抵扣，那筆點數到期後餘額為 0 而不是負數', async () => {
      await addPaidOrder('o1', ORG, 'amy', { unitPrice: '1000' });
      await service.findAllForOrganization('biru');
      await client.query(
        `update point_transaction set remaining_points = 30 where order_id = 'o1'`,
      );
      await client.query(
        `update "order" set order_status = 'OrderCancelled' where id = 'o1'`,
      );
      expect((await service.getAllMine('amy')).balance).toBe(-70);

      await addPaidOrder('o2', ORG, 'amy', {
        paymentDate: '2026-03-01',
        unitPrice: '1000',
      });
      await service.getAllMine('amy');
      await service.getAllMine('amy');

      expect(await remainingByType('o1')).toEqual([
        { remainingPoints: 0, type: 'earn' },
        { remainingPoints: 0, type: 'revoke' },
      ]);
      expect(await remainingByType('o2')).toEqual([
        { remainingPoints: 30, type: 'earn' },
      ]);
      expect(await balanceAt('2027-03-02T00:00:00Z')).toBe(0);
    });

    it('退款時會員還有其他點數就立即抵扣，不留下欠點', async () => {
      await addPaidOrder('o1', ORG, 'amy', { unitPrice: '1000' });
      await addPaidOrder('o2', OTHER_ORG, 'amy', { unitPrice: '1000' });
      await service.getAllMine('amy');
      await client.query(
        `update point_transaction set remaining_points = 30 where order_id = 'o1'`,
      );

      await service.revokeForOrder(db as unknown as DrizzleDB, {
        orderBecomesTerminal: true,
        orderId: 'o1',
        ratio: 1,
      });

      expect((await service.getAllMine('amy')).balance).toBe(30);
      expect(
        await db
          .select()
          .from(pointTransaction)
          .where(lt(pointTransaction.remainingPoints, 0)),
      ).toEqual([]);
      expect(await remainingByType('o2')).toEqual([
        { remainingPoints: 30, type: 'earn' },
      ]);
    });
  });

  it('依會員 email 篩選', async () => {
    await addPaidOrder('o1', ORG, 'amy');
    await addPaidOrder('o2', ORG, 'bob');

    const result = await service.findAllForOrganization('biru', {
      filterField: 'userEmail',
      filterOperator: 'contains',
      filterValue: 'bob',
    });

    expect(result.data.map(({ userEmail }) => userEmail)).toEqual([
      'bob@example.com',
    ]);
    expect(result.total).toBe(1);
  });

  it('補點記下原因與操作者，列入本店明細與會員餘額', async () => {
    const created = await service.adjustForOrganization(
      'biru',
      { email: 'AMY@example.com', note: ' 客訴補償 ', points: 30 },
      'bob',
      'admin',
    );

    expect(created).toEqual(
      expect.objectContaining({
        note: '客訴補償',
        points: 30,
        remainingPoints: 30,
        type: 'adjust',
        userEmail: 'amy@example.com',
      }),
    );
    const [row] = await db
      .select()
      .from(pointTransaction)
      .where(eq(pointTransaction.id, created.id));
    expect(row).toEqual(
      expect.objectContaining({ adjustedBy: 'bob', organizationId: ORG }),
    );
    expect((await service.findAllForOrganization('biru')).data).toEqual([
      expect.objectContaining({ id: created.id, note: '客訴補償' }),
    ]);
    expect((await service.getAllMine('amy')).balance).toBe(30);
  });

  it('扣點先補入未入點的訂單，只從本店剩餘點數扣', async () => {
    await addPaidOrder('o1', ORG, 'amy');
    await addPaidOrder('o2', OTHER_ORG, 'amy');

    const created = await service.adjustForOrganization(
      'biru',
      { email: 'amy@example.com', note: '誤發', points: -4 },
      'bob',
      'admin',
    );

    expect(created).toEqual(
      expect.objectContaining({ points: -4, remainingPoints: 0 }),
    );
    const earned = await db
      .select({
        organizationId: pointTransaction.organizationId,
        remainingPoints: pointTransaction.remainingPoints,
      })
      .from(pointTransaction)
      .where(eq(pointTransaction.type, 'earn'));
    expect(earned).toEqual(
      expect.arrayContaining([
        { organizationId: ORG, remainingPoints: 6 },
        { organizationId: OTHER_ORG, remainingPoints: 10 },
      ]),
    );
    expect((await service.getAllMine('amy')).balance).toBe(16);
  });

  it('扣點超過本店剩餘點數時拒絕，不動任何明細', async () => {
    await addPaidOrder('o1', ORG, 'amy');
    await addPaidOrder('o2', OTHER_ORG, 'amy');

    await expect(
      service.adjustForOrganization(
        'biru',
        { email: 'amy@example.com', note: '誤發', points: -11 },
        'bob',
        'admin',
      ),
    ).rejects.toThrow('common.points.insufficient');
    expect(
      (await db.select().from(pointTransaction)).map(
        ({ remainingPoints, type }) => ({ remainingPoints, type }),
      ),
    ).toEqual([
      { remainingPoints: 10, type: 'earn' },
      { remainingPoints: 10, type: 'earn' },
    ]);
  });

  it('單筆超過 NT$3,000 換算點數時只有 owner 能補點或扣點', async () => {
    await addPaidOrder('o1', ORG, 'amy');

    await expect(
      service.adjustForOrganization(
        'biru',
        { email: 'amy@example.com', note: '補償', points: 301 },
        'bob',
        'admin',
      ),
    ).rejects.toThrow('common.points.adjustOwnerOnly');
    await expect(
      service.adjustForOrganization(
        'biru',
        { email: 'amy@example.com', note: '誤發', points: -301 },
        'bob',
        'member',
      ),
    ).rejects.toThrow('common.points.adjustOwnerOnly');
    expect(
      await service.adjustForOrganization(
        'biru',
        { email: 'amy@example.com', note: '補償', points: 300 },
        'bob',
        'admin',
      ),
    ).toEqual(expect.objectContaining({ points: 300 }));
    expect(
      await service.adjustForOrganization(
        'biru',
        { email: 'amy@example.com', note: '活動', points: 301 },
        'bob',
        'owner',
      ),
    ).toEqual(expect.objectContaining({ points: 301 }));
  });

  it('owner 門檻依全品牌每點金額換算，金額不大於 0 時只有 owner 能調整', async () => {
    await client.exec(`update point_setting set amount_per_point = 33.33`);
    expect(
      await service.adjustForOrganization(
        'biru',
        { email: 'amy@example.com', note: '補償', points: 90 },
        'bob',
        'admin',
      ),
    ).toEqual(expect.objectContaining({ points: 90 }));
    await expect(
      service.adjustForOrganization(
        'biru',
        { email: 'amy@example.com', note: '補償', points: 91 },
        'bob',
        'admin',
      ),
    ).rejects.toThrow('common.points.adjustOwnerOnly');

    await client.exec(`update point_setting set amount_per_point = 0`);
    await expect(
      service.adjustForOrganization(
        'biru',
        { email: 'amy@example.com', note: '補償', points: 1 },
        'bob',
        'admin',
      ),
    ).rejects.toThrow('common.points.adjustOwnerOnly');
  });

  it('補扣點上限依每點金額以分精確換算，點數未啟用時 enabled 為 false', async () => {
    await expect(service.getAdjustmentLimit('admin')).resolves.toEqual({
      enabled: true,
      ownerOnlyAbovePoints: 300,
    });

    for (const [amountPerPoint, ownerOnlyAbovePoints] of [
      ['30', 100],
      ['1.1', 2727],
      ['0.07', 42857],
      ['0', 0],
    ] as const) {
      await client.query(`update point_setting set amount_per_point = $1`, [
        amountPerPoint,
      ]);
      await expect(service.getAdjustmentLimit('admin')).resolves.toEqual({
        enabled: true,
        ownerOnlyAbovePoints,
      });
    }

    await client.exec(
      `update point_setting set amount_per_point = 30, points_enabled_at = null`,
    );
    await expect(service.getAdjustmentLimit('admin')).resolves.toEqual({
      enabled: false,
      ownerOnlyAbovePoints: 100,
    });
  });

  it('owner 不受補扣點上限限制，上限回傳 null', async () => {
    for (const role of ['owner', 'admin,owner']) {
      await expect(service.getAdjustmentLimit(role)).resolves.toEqual({
        enabled: true,
        ownerOnlyAbovePoints: null,
      });
    }
  });

  it('非 owner 可補扣到上限為止，超過上限拒絕', async () => {
    await client.exec(`update point_setting set amount_per_point = 1.1`);
    const { ownerOnlyAbovePoints } = await service.getAdjustmentLimit('admin');

    expect(
      await service.adjustForOrganization(
        'biru',
        {
          email: 'amy@example.com',
          note: '補償',
          points: ownerOnlyAbovePoints,
        },
        'bob',
        'admin',
      ),
    ).toEqual(expect.objectContaining({ points: ownerOnlyAbovePoints }));
    await expect(
      service.adjustForOrganization(
        'biru',
        {
          email: 'amy@example.com',
          note: '補償',
          points: ownerOnlyAbovePoints + 1,
        },
        'bob',
        'admin',
      ),
    ).rejects.toThrow('common.points.adjustOwnerOnly');
  });

  it('不能調整自己的點數', async () => {
    await expect(
      service.adjustForOrganization(
        'biru',
        { email: 'bob@example.com', note: '補償', points: 5 },
        'bob',
        'admin',
      ),
    ).rejects.toThrow('common.points.adjustSelf');
  });

  it('點數未啟用時拒絕調整', async () => {
    await client.exec(`update point_setting set points_enabled_at = null`);

    await expect(
      service.adjustForOrganization(
        'biru',
        { email: 'amy@example.com', note: '補償', points: 5 },
        'bob',
        'admin',
      ),
    ).rejects.toThrow('common.points.notEnabled');
  });

  it('找不到 email 對應的會員時回 404', async () => {
    await expect(
      service.adjustForOrganization(
        'biru',
        { email: 'nobody@example.com', note: '補償', points: 5 },
        'bob',
        'admin',
      ),
    ).rejects.toThrow('common.coupons.memberNotFound');
  });
});

describe('PointsService.redeem', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: PointsService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new PointsService(
      db as unknown as DrizzleDB,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
      {} as MailsService,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate point_transaction, coupon, "user" cascade');
    await client.query(
      `insert into "user" (id, name, email, first_name) values ($1, '王小明', 'a@example.com', '小明')`,
      [USER],
    );
    await client.exec(
      `insert into coupon (id, code, discount_type, discount_value, points_cost, per_user_limit) values ('c1', 'LATTE', 'fixed', 10, 5, 1)`,
    );
    await db.insert(pointTransaction).values({
      id: 'earn',
      points: 20,
      remainingPoints: 20,
      type: 'earn',
      userId: USER,
    });
  });

  it('已達每人兌換上限時拒絕再兌換，不扣點也不發券', async () => {
    await service.redeem(USER, 'c1');

    await expect(service.redeem(USER, 'c1')).rejects.toThrow(
      'common.points.perUserLimitReached',
    );
    expect(await db.select().from(schema.userCoupon)).toHaveLength(1);
    const [earn] = await db
      .select()
      .from(pointTransaction)
      .where(eq(pointTransaction.id, 'earn'));
    expect(earn.remainingPoints).toBe(15);
  });
});
