import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import { coupon, userCoupon } from '../db/schema/coupons.js';
import * as schema from '../db/schema/index.js';
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
