import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import type { Coupon } from '../db/schema/coupons.js';
import { coupon, userCoupon } from '../db/schema/coupons.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { OrderPricingService } from '../orders/order-pricing.service.js';

import { CouponsService } from './coupons.service.js';

describe('CouponsService 刪除與領券、發券同時發生', () => {
  const queries: string[] = [];

  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: CouponsService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, {
      logger: { logQuery: (query) => queries.push(query) },
      schema,
    });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new CouponsService(
      db as unknown as DrizzleDB,
      {} as OrderPricingService,
    );
    await client.query(
      `insert into "user" (id, name, email, first_name) values ('member', 'member', 'member@example.com', 'member')`,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate user_coupon, coupon cascade');
    await db.insert(coupon).values({
      code: 'SUMMER',
      discountType: 'fixed',
      discountValue: '50',
      id: 'summer',
      isClaimable: true,
    });
    queries.length = 0;
  });

  it('先鎖住優惠券再檢查是否已發出，才刪除', async () => {
    await service.remove('summer');

    const lock = queries.findIndex(
      (query) =>
        query.includes('from "coupon"') && query.endsWith('for update'),
    );
    const inUse = queries.findIndex((query) =>
      query.includes('from "user_coupon"'),
    );
    const remove = queries.findIndex((query) =>
      query.startsWith('delete from "coupon"'),
    );
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(inUse);
    expect(inUse).toBeLessThan(remove);
    await expect(db.query.coupon.findFirst()).resolves.toBeUndefined();
  });

  it('已有會員持有就不刪除', async () => {
    await db.insert(userCoupon).values({
      couponId: 'summer',
      id: 'held',
      source: 'claimed',
      userId: 'member',
    });

    await expect(service.remove('summer')).rejects.toMatchObject({
      status: 409,
      response: { code: 'inUse' },
    });
    await expect(db.query.coupon.findFirst()).resolves.toBeDefined();
  });

  it('不存在的優惠券回 couponNotFound', async () => {
    await expect(service.remove('missing')).rejects.toMatchObject({
      status: 404,
      response: { code: 'couponNotFound' },
    });
  });

  const deletedAfterLookup = (overrides: Partial<Coupon> = {}) => {
    const findFirst = vi
      .spyOn(db.query.coupon, 'findFirst')
      .mockResolvedValueOnce({
        applicableOrganizationIds: null,
        code: 'GONE',
        discountType: 'fixed',
        discountValue: '50',
        id: 'gone',
        isActive: true,
        isClaimable: true,
        totalLimit: null,
        validFrom: null,
        validThrough: null,
        ...overrides,
      } as Coupon);
    onTestFinished(() => findFirst.mockRestore());
  };

  it.each([
    ['沒有總量上限', null],
    ['有總量上限', 10],
  ])('領取時優惠券剛被刪除回 notFound（%s）', async (_, totalLimit) => {
    deletedAfterLookup({ totalLimit });

    await expect(service.claim('gone', 'member')).rejects.toMatchObject({
      status: 400,
      response: { code: 'notFound' },
    });
  });

  it('自動發券時優惠券剛被刪除就略過，不讓請求失敗', async () => {
    const findMany = vi
      .spyOn(db.query.coupon, 'findMany')
      .mockResolvedValueOnce([
        {
          code: 'GONE',
          createdAt: new Date(0),
          id: 'gone',
          issueTrigger: 'signup',
          validFrom: null,
        } as Coupon,
      ]);
    onTestFinished(() => findMany.mockRestore());

    await expect(service.issueSignupCoupons('member')).resolves.toBeUndefined();
    await expect(db.query.userCoupon.findMany()).resolves.toEqual([]);
  });

  it.each([
    ['沒有總量上限', null],
    ['有總量上限', 10],
  ])('發放時優惠券剛被刪除回 couponNotFound（%s）', async (_, totalLimit) => {
    deletedAfterLookup({ totalLimit });

    await expect(
      service.grant('gone', 'member@example.com', 'admin'),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'couponNotFound' },
    });
  });
});
