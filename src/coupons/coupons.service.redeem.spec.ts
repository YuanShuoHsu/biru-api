import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import { coupon, userCoupon } from '../db/schema/coupons.js';
import * as schema from '../db/schema/index.js';
import { order } from '../db/schema/orders.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { OrderPricingService } from '../orders/order-pricing.service.js';

import { CouponsService } from './coupons.service.js';

describe('CouponsService.redeem 總量上限', () => {
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
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate user_coupon, coupon, "user" cascade');
    await client.query(
      `insert into "user" (id, name, email, first_name) values
        ('a', 'A', 'a@example.com', 'A'),
        ('b', 'B', 'b@example.com', 'B')`,
    );
    await db.insert(coupon).values({
      code: 'LIMITED',
      discountType: 'fixed',
      discountValue: '50',
      id: 'limited',
      totalLimit: 2,
    });
  });

  const load = async () => {
    const [found] = await db
      .select()
      .from(coupon)
      .where(eq(coupon.id, 'limited'));
    return found;
  };

  const reserve = (userId: string) =>
    db.insert(userCoupon).values({
      couponId: 'limited',
      id: `wallet-${userId}`,
      source: 'claimed',
      userId,
    });

  const redeemByCode = async () =>
    service.redeem(db as unknown as DrizzleDB, {
      coupon: await load(),
      orderId: 'order',
      userCouponId: null,
      userId: null,
    });

  it('輸入代碼兌換時，錢包中尚未使用的券也算進總量', async () => {
    await reserve('a');
    await redeemByCode();
    await expect(redeemByCode()).rejects.toMatchObject({
      response: { code: 'usedUp' },
    });
    expect((await load()).usedCount).toBe(1);
  });

  it('名額都在錢包裡時，輸入代碼兌換被拒絕', async () => {
    await reserve('a');
    await reserve('b');
    await expect(redeemByCode()).rejects.toMatchObject({
      response: { code: 'usedUp' },
    });
    expect((await load()).usedCount).toBe(0);
  });

  it('下單途中改設上限時，以鎖定後讀到的上限為準', async () => {
    await db
      .update(coupon)
      .set({ totalLimit: null })
      .where(eq(coupon.id, 'limited'));
    const stale = await load();
    await db
      .update(coupon)
      .set({ totalLimit: 1 })
      .where(eq(coupon.id, 'limited'));
    await reserve('a');
    await expect(
      service.redeem(db as unknown as DrizzleDB, {
        coupon: stale,
        orderId: 'order',
        userCouponId: null,
        userId: null,
      }),
    ).rejects.toMatchObject({ response: { code: 'usedUp' } });
  });

  it('沒有總量上限時不檢查', async () => {
    await db
      .update(coupon)
      .set({ totalLimit: null })
      .where(eq(coupon.id, 'limited'));
    await reserve('a');
    await reserve('b');
    await redeemByCode();
    await redeemByCode();
    expect((await load()).usedCount).toBe(2);
  });
});

describe('CouponsService.redeem 每人限用次數', () => {
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
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      `truncate "order", user_coupon, coupon, organization, "user" cascade;
       insert into "user" (id, name, email, first_name) values ('a', 'A', 'a@example.com', 'A');
       insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');`,
    );
  });

  const addCoupon = (id: string, code: string, createdAt: string) =>
    db.insert(coupon).values({
      code,
      createdAt: new Date(createdAt),
      discountType: 'fixed',
      discountValue: '50',
      id,
      perUserLimit: 1,
    });

  const addOrder = (
    id: string,
    couponId: string,
    discountCode: string,
    createdAt: string,
  ) =>
    db.insert(order).values({
      couponId,
      createdAt: new Date(createdAt),
      customer: { name: '客人' },
      discountCode,
      id,
      mode: 'pickup',
      orderNumber: '1',
      orderStatus: 'OrderDelivered',
      paymentMethod: 'Cash',
      sellerId: 'org',
      subtotal: '100',
      userId: 'a',
    });

  const redeem = async (couponId: string, orderId: string) => {
    const [found] = await db
      .select()
      .from(coupon)
      .where(eq(coupon.id, couponId));
    return service.redeem(db as unknown as DrizzleDB, {
      coupon: found,
      orderId,
      userCouponId: null,
      userId: 'a',
    });
  };

  it('改碼後仍算進改碼前的訂單', async () => {
    await addCoupon('spring', 'SPRING', '2026-05-01 00:00');
    await addOrder('o1', 'spring', 'SPRING', '2026-06-01 00:00');
    await db
      .update(coupon)
      .set({ code: 'RENAMED' })
      .where(eq(coupon.id, 'spring'));
    await addOrder('o2', 'spring', 'RENAMED', '2026-07-01 00:00');

    await expect(redeem('spring', 'o2')).rejects.toMatchObject({
      response: { code: 'perUserLimitReached' },
    });
  });

  it('碼被新券重用時，新券不算舊券的訂單', async () => {
    await addCoupon('spring', 'SPRING', '2026-05-01 00:00');
    await addOrder('o1', 'spring', 'SPRING', '2026-06-01 00:00');
    await db
      .update(coupon)
      .set({ code: 'RENAMED' })
      .where(eq(coupon.id, 'spring'));
    await addCoupon('reused', 'SPRING', '2026-06-15 00:00');
    await addOrder('o2', 'reused', 'SPRING', '2026-07-01 00:00');

    await expect(redeem('reused', 'o2')).resolves.toBeUndefined();
  });

  it('沒有 coupon_id 的舊訂單依碼計算，但不算券建立前的訂單', async () => {
    await addCoupon('spring', 'SPRING', '2026-05-01 00:00');
    await client.exec(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, user_id, discount_code, created_at, updated_at) values
         ('before', '{"name":"客人"}', 'pickup', '1', 'OrderDelivered', 'Cash', 'org', 100, 'a', 'SPRING', '2026-04-01 00:00', now());`,
    );
    await addOrder('o2', 'spring', 'SPRING', '2026-07-01 00:00');
    await expect(redeem('spring', 'o2')).resolves.toBeUndefined();

    await client.exec(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, user_id, discount_code, created_at, updated_at) values
         ('legacy', '{"name":"客人"}', 'pickup', '1', 'OrderDelivered', 'Cash', 'org', 100, 'a', 'spring', '2026-06-01 00:00', now());`,
    );
    await expect(redeem('spring', 'o2')).rejects.toMatchObject({
      response: { code: 'perUserLimitReached' },
    });
  });
});
