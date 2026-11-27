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

describe('CouponsService.restore', () => {
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
      `truncate user_coupon, coupon, "order", organization, "user" cascade;
       insert into "user" (id, name, email, first_name) values ('a', 'A', 'a@example.com', 'A');
       insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, discount_code, created_at, updated_at) values
         ('o1', '{"email": "a@example.com"}', 'pickup', '1', 'OrderCancelled', 'Cash', 'org', 100, 'SPRING', '2026-06-01 00:00', now());`,
    );
  });

  const addCoupon = (id: string, code: string, createdAt: string) =>
    db.insert(coupon).values({
      code,
      createdAt: new Date(createdAt),
      discountType: 'fixed',
      discountValue: '50',
      id,
      usedCount: 1,
    });

  const usedCountOf = async (id: string) => {
    const [found] = await db
      .select({ usedCount: coupon.usedCount })
      .from(coupon)
      .where(eq(coupon.id, id));
    return found.usedCount;
  };

  const restore = () =>
    service.restore(db as unknown as DrizzleDB, {
      code: 'SPRING',
      orderId: 'o1',
    });

  it('錢包券依訂單還原，並清掉使用紀錄', async () => {
    await addCoupon('wallet', 'SPRING', '2026-05-01 00:00');
    await db.insert(userCoupon).values({
      couponId: 'wallet',
      id: 'held',
      orderId: 'o1',
      source: 'claimed',
      usedAt: new Date('2026-06-01 00:00'),
      userId: 'a',
    });

    await restore();

    expect(await usedCountOf('wallet')).toBe(0);
    const [held] = await db
      .select({ orderId: userCoupon.orderId, usedAt: userCoupon.usedAt })
      .from(userCoupon)
      .where(eq(userCoupon.id, 'held'));
    expect(held).toEqual({ orderId: null, usedAt: null });
  });

  it('錢包券改名、舊碼被另一張券使用後，仍還原原券', async () => {
    await addCoupon('wallet', 'RENAMED', '2026-05-01 00:00');
    await addCoupon('other', 'SPRING', '2026-04-01 00:00');
    await db.insert(userCoupon).values({
      couponId: 'wallet',
      id: 'held',
      orderId: 'o1',
      source: 'claimed',
      usedAt: new Date('2026-06-01 00:00'),
      userId: 'a',
    });

    await restore();

    expect(await usedCountOf('wallet')).toBe(0);
    expect(await usedCountOf('other')).toBe(1);
  });

  it('輸入代碼使用的券，依代碼還原', async () => {
    await addCoupon('typed', 'spring', '2026-05-01 00:00');

    await restore();

    expect(await usedCountOf('typed')).toBe(0);
  });

  it('代碼被下單後才建立的券重用時，不扣到新券', async () => {
    await addCoupon('reused', 'SPRING', '2026-07-01 00:00');

    await restore();

    expect(await usedCountOf('reused')).toBe(1);
  });

  const placeWith = (couponId: string) =>
    db.update(order).set({ couponId }).where(eq(order.id, 'o1'));

  it('輸入代碼使用的券下單後改碼，仍還原原券', async () => {
    await addCoupon('typed', 'RENAMED', '2026-05-01 00:00');
    await placeWith('typed');

    await restore();

    expect(await usedCountOf('typed')).toBe(0);
  });

  it('較早建立的券事後改成同碼，不會被誤減', async () => {
    await addCoupon('typed', 'RENAMED', '2026-05-01 00:00');
    await addCoupon('earlier', 'SPRING', '2026-04-01 00:00');
    await placeWith('typed');

    await restore();

    expect(await usedCountOf('typed')).toBe(0);
    expect(await usedCountOf('earlier')).toBe(1);
  });
});
