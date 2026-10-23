import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
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
        `insert into organization (id, name, slug, created_at, amount_per_point, points_enabled_at)
         values ($1, $2, $2, now(), 10, '2026-01-01')`,
        [id, slug],
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
  ) => {
    await client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, payment_date, order_status, user_id)
       values ($1, '{"name":"客人"}', 'pickup', $1, 'Cash', $2, 100, '2026-02-01', 'OrderDelivered', $3)`,
      [id, sellerId, userId],
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
});
