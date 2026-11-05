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

describe('CouponsService 註冊禮、生日券與滿額券發放', () => {
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
      'truncate user_coupon, coupon, order_item, "order", organization, "user" cascade',
    );
    await client.query(
      `insert into "user" (id, name, email, first_name, birth_date) values
        ('may', '五月', 'may@example.com', '五月', '1990-05-20'),
        ('june', '六月', 'june@example.com', '六月', '1990-06-01'),
        ('none', '未填', 'none@example.com', '未填', null)`,
    );
    await db.insert(coupon).values([
      {
        code: 'WELCOME',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        discountType: 'fixed',
        discountValue: '50',
        id: 'signup',
        issueTrigger: 'signup',
      },
      {
        code: 'BIRTHDAY',
        discountType: 'fixed',
        discountValue: '100',
        id: 'birthday',
        issueTrigger: 'birthday',
      },
      {
        code: 'OFF',
        discountType: 'fixed',
        discountValue: '100',
        id: 'inactive-signup',
        isActive: false,
        issueTrigger: 'signup',
      },
    ]);
  });

  const wallet = () =>
    db
      .select({
        couponId: userCoupon.couponId,
        source: userCoupon.source,
        userId: userCoupon.userId,
      })
      .from(userCoupon)
      .orderBy(userCoupon.userId, userCoupon.couponId);

  const signUp = (id: string, createdAt: string) =>
    client.query(
      `insert into "user" (id, name, email, first_name, created_at) values ($1, $1, $1 || '@example.com', $1, $2)`,
      [id, createdAt],
    );

  const paidOrder = async (id: string, paymentDate: string) => {
    await client.query(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, user_id, payment_date)
         values ($1, '{"name":"客人"}', 'pickup', $1, 'OrderDelivered', 'Credit', 'org', 300, 'may', $2)`,
      [id, paymentDate],
    );
    await client.query(
      `insert into order_item (id, order_id, menu_item_id, menu_item_name, order_quantity, unit_price)
         values ($1, $1, 'latte', 'latte', 1, 300)`,
      [id],
    );
  };

  it('註冊禮只發給券開始後才註冊的會員', async () => {
    await db
      .update(coupon)
      .set({ createdAt: new Date('2026-03-01T00:00:00Z') })
      .where(eq(coupon.id, 'signup'));
    await signUp('early', '2026-02-28T23:59:59Z');
    await signUp('late', '2026-03-01T00:00:00Z');

    await service.issueSignupCoupons('early');
    await service.issueSignupCoupons('late');

    await expect(wallet()).resolves.toEqual([
      { couponId: 'signup', source: 'signup', userId: 'late' },
    ]);
  });

  it('註冊禮有 validFrom 時以 validFrom 為開始', async () => {
    await db
      .update(coupon)
      .set({
        createdAt: new Date('2026-01-01T00:00:00Z'),
        validFrom: new Date('2026-03-01T00:00:00Z'),
      })
      .where(eq(coupon.id, 'signup'));
    await signUp('before', '2026-02-01T00:00:00Z');
    await signUp('after', '2026-03-02T00:00:00Z');

    await service.issueSignupCoupons('before');
    await service.issueSignupCoupons('after');

    await expect(wallet()).resolves.toEqual([
      { couponId: 'signup', source: 'signup', userId: 'after' },
    ]);
  });

  it('滿額券只算券開始後付款的訂單', async () => {
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address)
         values ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
    );
    await db.insert(coupon).values({
      code: 'SPEND',
      createdAt: new Date('2026-03-01T00:00:00Z'),
      discountType: 'fixed',
      discountValue: '30',
      id: 'spend',
      issueMinSpend: '200',
      issueTrigger: 'spend',
    });
    await paidOrder('old-1', '2026-02-10T00:00:00Z');
    await paidOrder('old-2', '2026-02-20T00:00:00Z');
    await paidOrder('new', '2026-03-05T00:00:00Z');

    await service['issueEligibleCoupons']('org', 'may');
    await service['issueEligibleCoupons']('org', 'may');

    await expect(
      wallet().then((rows) => rows.filter((row) => row.source === 'spend')),
    ).resolves.toEqual([{ couponId: 'spend', source: 'spend', userId: 'may' }]);
  });

  it('註冊禮只發啟用中的註冊券，重複呼叫不會多發', async () => {
    await service.issueSignupCoupons('none');
    await service.issueSignupCoupons('none');

    await expect(wallet()).resolves.toEqual([
      { couponId: 'signup', source: 'signup', userId: 'none' },
    ]);
  });

  it('生日券依平台時區的月份發給當月壽星，同一年不重發', async () => {
    const mayFirstTaipei = new Date('2026-04-30T16:00:00Z');

    await expect(service.issueBirthdayCoupons(mayFirstTaipei)).resolves.toBe(1);
    await service.issueBirthdayCoupons(new Date('2026-05-20T04:00:00Z'));

    await expect(wallet()).resolves.toEqual([
      { couponId: 'birthday', source: 'birthday', userId: 'may' },
    ]);
  });

  it('沒有啟用中的生日券時不發券', async () => {
    await db.delete(coupon);

    await expect(
      service.issueBirthdayCoupons(new Date('2026-05-01T00:00:00Z')),
    ).resolves.toBe(0);
    await expect(wallet()).resolves.toEqual([]);
  });
});
