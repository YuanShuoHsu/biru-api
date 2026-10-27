import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import { coupon, userCoupon } from '../db/schema/coupons.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import type { OrderPricingService } from '../orders/order-pricing.service.js';

import { CouponsService } from './coupons.service.js';

describe('CouponsService 註冊禮與生日券發放', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: CouponsService;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new CouponsService(
      db as unknown as DrizzleDB,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
      {} as OrderPricingService,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate user_coupon, coupon, "user" cascade');
    await client.query(
      `insert into "user" (id, name, email, first_name, birth_date) values
        ('may', '五月', 'may@example.com', '五月', '1990-05-20'),
        ('june', '六月', 'june@example.com', '六月', '1990-06-01'),
        ('none', '未填', 'none@example.com', '未填', null)`,
    );
    await db.insert(coupon).values([
      {
        code: 'WELCOME',
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
