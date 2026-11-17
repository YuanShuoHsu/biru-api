import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import type { Coupon } from '../db/schema/coupons.js';
import { coupon } from '../db/schema/coupons.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { OrderPricingService } from '../orders/order-pricing.service.js';

import { CouponsService } from './coupons.service.js';

describe('CouponsService 領券、發券與優惠券異動同時發生', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: CouponsService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new CouponsService(
      db as unknown as DrizzleDB,
      {} as OrderPricingService,
    );
    await client.query(
      `insert into "user" (id, name, email, first_name) values ('member', 'member', 'member@example.com', 'member'), ('other', 'other', 'other@example.com', 'other')`,
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
  });

  const staleLookup = async () => {
    const found = await db.query.coupon.findFirst();
    const findFirst = vi
      .spyOn(db.query.coupon, 'findFirst')
      .mockResolvedValueOnce(found);
    onTestFinished(() => findFirst.mockRestore());
  };

  const changedAfterLookup = async (changes: Partial<Coupon>) => {
    await staleLookup();
    await db.update(coupon).set(changes);
  };

  const expired = { validThrough: new Date(Date.now() - 1000) };

  it.each([
    ['停用', { isActive: false }],
    ['過期', expired],
    ['改為不開放領取', { isClaimable: false }],
    ['改為點數兌換', { pointsCost: 10 }],
  ])('領取時優惠券剛被%s回 notFound，不發券', async (_, changes) => {
    await changedAfterLookup(changes);

    await expect(service.claim('summer', 'member')).rejects.toMatchObject({
      status: 400,
      response: { code: 'notFound' },
    });
    await expect(db.query.userCoupon.findMany()).resolves.toEqual([]);
  });

  it('領取時剛設了總量上限且已發完回 usedUp', async () => {
    await service.claim('summer', 'other');
    await changedAfterLookup({ totalLimit: 1 });

    await expect(service.claim('summer', 'member')).rejects.toMatchObject({
      status: 400,
      response: { code: 'usedUp' },
    });
    await expect(db.query.userCoupon.findMany()).resolves.toHaveLength(1);
  });

  it('領取時優惠券剛被刪除回 notFound，發放回 couponNotFound', async () => {
    await staleLookup();
    await db.delete(coupon);
    await expect(service.claim('summer', 'member')).rejects.toMatchObject({
      status: 400,
      response: { code: 'notFound' },
    });

    await db.insert(coupon).values({
      code: 'SUMMER',
      discountType: 'fixed',
      discountValue: '50',
      id: 'summer',
    });
    await staleLookup();
    await db.delete(coupon);
    await expect(
      service.grant('summer', 'member@example.com', 'admin'),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'couponNotFound' },
    });
  });

  it('領取後回傳交易內讀到的優惠內容', async () => {
    await changedAfterLookup({ discountValue: '30' });

    await expect(service.claim('summer', 'member')).resolves.toMatchObject({
      coupon: { discountValue: '30.00' },
    });
  });

  it.each([
    ['停用', 'grantInactive', { isActive: false }],
    ['過期', 'grantExpired', expired],
  ])('發放時優惠券剛被%s回 %s，不發券', async (_, code, changes) => {
    await changedAfterLookup(changes);

    await expect(
      service.grant('summer', 'member@example.com', 'admin'),
    ).rejects.toMatchObject({ status: 400, response: { code } });
    await expect(db.query.userCoupon.findMany()).resolves.toEqual([]);
  });

  it('發放時剛設了總量上限且已發完回 usedUp', async () => {
    await service.claim('summer', 'other');
    await changedAfterLookup({ totalLimit: 1 });

    await expect(
      service.grant('summer', 'member@example.com', 'admin'),
    ).rejects.toMatchObject({ status: 400, response: { code: 'usedUp' } });
    await expect(db.query.userCoupon.findMany()).resolves.toHaveLength(1);
  });
});
