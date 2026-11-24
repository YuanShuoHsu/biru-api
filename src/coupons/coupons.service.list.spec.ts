import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import { coupon, userCoupon } from '../db/schema/coupons.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { OrderPricingService } from '../orders/order-pricing.service.js';

import { CouponsService } from './coupons.service.js';

describe('CouponsService 分頁同值排序', () => {
  const createdAt = new Date('2026-11-01T00:00:00Z');
  const ids = ['a', 'b', 'c', 'd', 'e'];

  let client: PGlite;
  let service: CouponsService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new CouponsService(
      db as unknown as DrizzleDB,
      {} as OrderPricingService,
    );

    await client.query(
      `insert into "user" (id, name, email, first_name) values ('member', 'member', 'member@example.com', 'member')`,
    );
    await db.insert(coupon).values(
      ids.map((id) => ({
        code: `CODE-${id}`,
        createdAt,
        discountType: 'fixed' as const,
        discountValue: '50',
        id,
      })),
    );
    await db.insert(userCoupon).values(
      ids.map((id) => ({
        couponId: 'a',
        createdAt,
        id,
        source: 'spend' as const,
        userId: 'member',
      })),
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('券列表建立時間相同時以 id 決定順序，分頁不重複也不漏', async () => {
    const page = async (offset: number) =>
      (await service.findAll({ limit: 2, offset })).data.map(({ id }) => id);

    expect([
      ...(await page(0)),
      ...(await page(2)),
      ...(await page(4)),
    ]).toEqual(['e', 'd', 'c', 'b', 'a']);
  });

  it('領取名單發放時間相同時以 id 決定順序，分頁不重複也不漏', async () => {
    const page = async (offset: number) =>
      (
        await service.findRecipients('a', {
          limit: 2,
          offset,
          sortBy: 'source',
          sortDirection: 'asc',
        })
      ).data.map(({ id }) => id);

    expect([
      ...(await page(0)),
      ...(await page(2)),
      ...(await page(4)),
    ]).toEqual(['e', 'd', 'c', 'b', 'a']);
  });
});

describe('CouponsService 券列表的 grantable', () => {
  const base = { discountType: 'fixed' as const, discountValue: '50' };

  let client: PGlite;
  let service: CouponsService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new CouponsService(
      db as unknown as DrizzleDB,
      {} as OrderPricingService,
    );

    await client.query(
      `insert into "user" (id, name, email, first_name) values ('member', 'member', 'member@example.com', 'member')`,
    );
    await db
      .insert(coupon)
      .values(
        [
          { id: 'open' },
          { id: 'inactive', isActive: false },
          { id: 'expired', validThrough: new Date(Date.now() - 1000) },
          { id: 'upcoming', validFrom: new Date(Date.now() + 86_400_000) },
          { id: 'redeemed-out', totalLimit: 1, usedCount: 1 },
          { id: 'reserved-out', totalLimit: 1 },
          { id: 'one-left', totalLimit: 2, usedCount: 1 },
          { applicableOrganizationIds: ['org'], id: 'exclusive' },
          { applicableOrganizationIds: ['org', 'other'], id: 'shared' },
        ].map((row) => ({ ...base, code: row.id, ...row })),
      );
    await db.insert(userCoupon).values([
      {
        couponId: 'reserved-out',
        id: 'held',
        source: 'granted',
        userId: 'member',
      },
      {
        couponId: 'one-left',
        id: 'used',
        source: 'granted',
        usedAt: new Date(),
        userId: 'member',
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  const grantableIds = async (organizationId?: string) =>
    (await service.findAll({ limit: 100, offset: 0 }, organizationId)).data
      .filter(({ grantable }) => grantable)
      .map(({ id }) => id)
      .sort();

  it('停用、過期、已發完的券不可發放，已使用的券不再佔名額', async () => {
    await expect(grantableIds()).resolves.toEqual([
      'exclusive',
      'one-left',
      'open',
      'shared',
      'upcoming',
    ]);
  });

  it('門市列表只有本店專屬券可發放', async () => {
    await expect(grantableIds('org')).resolves.toEqual(['exclusive']);
  });

  it('列表標示可發放的券，發放不會因券的狀態被拒', async () => {
    for (const id of await grantableIds())
      await expect(
        service.grant(id, 'nobody@example.com', 'admin'),
      ).rejects.toMatchObject({ response: { code: 'memberNotFound' } });
  });
});

describe('CouponsService 空值排序', () => {
  let client: PGlite;
  let service: CouponsService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new CouponsService(
      db as unknown as DrizzleDB,
      {} as OrderPricingService,
    );

    await client.query(
      `insert into "user" (id, name, email, first_name) values ('member', 'member', 'member@example.com', 'member')`,
    );
    await db.insert(coupon).values(
      [
        { id: 'free', pointsCost: null },
        { id: 'cheap', pointsCost: 10 },
        { id: 'dear', pointsCost: 90 },
      ].map(({ id, pointsCost }) => ({
        code: `CODE-${id}`,
        discountType: 'fixed' as const,
        discountValue: '50',
        id,
        pointsCost,
      })),
    );
    await db.insert(userCoupon).values(
      [
        { id: 'unused', usedAt: null },
        { id: 'early', usedAt: new Date('2026-11-01T00:00:00Z') },
        { id: 'late', usedAt: new Date('2026-11-02T00:00:00Z') },
      ].map(({ id, usedAt }) => ({
        couponId: 'free',
        id,
        source: 'spend' as const,
        usedAt,
        userId: 'member',
      })),
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it.each([
    ['asc', ['cheap', 'dear', 'free']],
    ['desc', ['dear', 'cheap', 'free']],
  ] as const)(
    '券列表依點數排序時沒設點數的排最後（%s）',
    async (sortDirection, ids) => {
      const { data } = await service.findAll({
        sortBy: 'pointsCost',
        sortDirection,
      });

      expect(data.map(({ id }) => id)).toEqual(ids);
    },
  );

  it.each([
    ['asc', ['early', 'late', 'unused']],
    ['desc', ['late', 'early', 'unused']],
  ] as const)(
    '領取名單依使用時間排序時未使用的排最後（%s）',
    async (sortDirection, ids) => {
      const { data } = await service.findRecipients('free', {
        sortBy: 'usedAt',
        sortDirection,
      });

      expect(data.map(({ id }) => id)).toEqual(ids);
    },
  );
});
