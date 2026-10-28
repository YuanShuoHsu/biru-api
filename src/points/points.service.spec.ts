import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import type { I18nService } from 'nestjs-i18n';

import * as schema from '../db/schema/index.js';
import { pointTransaction } from '../db/schema/points.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { PointsService } from './points.service.js';

const USER = 'user';

describe('PointsService.getAllMine', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: PointsService;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new PointsService(
      db as unknown as DrizzleDB,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
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
    expect(result.balance).toBe(21);
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
    });
  });
});

describe('PointsService.findAllForOrganization', () => {
  const ORG = 'org';
  const OTHER_ORG = 'other';

  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: PointsService;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new PointsService(
      db as unknown as DrizzleDB,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
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
      `update point_setting set amount_per_point = 10, points_enabled_at = '2026-01-01', points_validity_years = null`,
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
    { amountPerPoint = null as string | null, paymentDate = '2026-02-01' } = {},
  ) => {
    await client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, payment_date, order_status, user_id, amount_per_point)
       values ($1, '{"name":"客人"}', 'pickup', $1, 'Cash', $2, 100, $4, 'OrderDelivered', $3, $5)`,
      [id, sellerId, userId, paymentDate, amountPerPoint],
    );
    await client.query(
      `insert into order_item (id, menu_item_id, menu_item_name, order_id, order_quantity, unit_price)
       values ($1, 'item', '拿鐵', $1, 1, 100)`,
      [id],
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

  it('點數停用時，沒有快照的訂單不入點', async () => {
    await client.exec(
      `update point_setting set amount_per_point = null, points_enabled_at = null`,
    );
    await addPaidOrder('o1', ORG, 'amy');

    expect((await service.findAllForOrganization('biru')).total).toBe(0);
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
