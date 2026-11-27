import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import { coupon } from '../db/schema/coupons.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { OrderPricingService } from '../orders/order-pricing.service.js';

import { CouponsService } from './coupons.service.js';

describe('CouponsService.getAvailable 每人限用次數', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: CouponsService;

  const addOrder = (
    id: string,
    discountCode: string,
    { orderStatus = 'OrderDelivered', sellerId = 'org', userId = 'a' } = {},
  ) =>
    client.query(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, user_id, discount_code)
       values ($1, '{"name":"客人"}', 'pickup', '1', $2, 'Cash', $3, 100, $4, $5)`,
      [id, orderStatus, sellerId, userId, discountCode],
    );

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
       insert into "user" (id, name, email, first_name) values
         ('a', 'A', 'a@example.com', 'A'),
         ('b', 'B', 'b@example.com', 'B');
       insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('outside', 'Outside', 'outside', now(), 'TW', '桃園市', '大園區', '中正東路一段');`,
    );
    await db.insert(coupon).values([
      {
        code: 'ONCE',
        discountType: 'fixed',
        discountValue: '50',
        id: 'once',
        isPublic: true,
        perUserLimit: 1,
      },
      {
        code: 'TWICE',
        discountType: 'fixed',
        discountValue: '50',
        id: 'twice',
        isPublic: true,
        perUserLimit: 2,
      },
      {
        applicableOrganizationIds: ['org', 'other'],
        code: 'SCOPED',
        discountType: 'fixed',
        discountValue: '50',
        id: 'scoped',
        isPublic: true,
        perUserLimit: 1,
      },
      {
        code: 'ANYONE',
        discountType: 'fixed',
        discountValue: '50',
        id: 'anyone',
        isPublic: true,
      },
    ]);
  });

  const availableIds = async (userId: string | null) =>
    (await service.getAvailable('biru', userId)).map((c) => c.id).sort();

  it('會員已用滿次數的公開券不列出', async () => {
    await addOrder('o1', 'once');
    await addOrder('o2', 'TWICE');

    expect(await availableIds('a')).toEqual(['anyone', 'scoped', 'twice']);
    expect(await availableIds('b')).toEqual([
      'anyone',
      'once',
      'scoped',
      'twice',
    ]);
  });

  it('幣別與店家不同的定額券與有最低消費的券不列出', async () => {
    await db.insert(coupon).values([
      {
        code: 'YEN',
        discountCurrency: 'JPY',
        discountType: 'fixed',
        discountValue: '100',
        id: 'yen',
        isPublic: true,
      },
      {
        code: 'YENMIN',
        discountCurrency: 'JPY',
        discountType: 'percentage',
        discountValue: '10',
        id: 'yen-min',
        isPublic: true,
        minSubtotal: '500',
      },
      {
        code: 'YENPCT',
        discountCurrency: 'JPY',
        discountType: 'percentage',
        discountValue: '10',
        id: 'yen-pct',
        isPublic: true,
      },
    ]);

    expect(await availableIds(null)).toEqual(['anyone', 'yen-pct']);
  });

  it('取消或退回的訂單不算用過', async () => {
    await addOrder('o1', 'ONCE', { orderStatus: 'OrderCancelled' });
    await addOrder('o2', 'ONCE', { orderStatus: 'OrderReturned' });

    expect(await availableIds('a')).toContain('once');
  });

  it('限定門市的券只計算在適用門市的訂單', async () => {
    await addOrder('o1', 'SCOPED', { sellerId: 'outside' });
    expect(await availableIds('a')).toContain('scoped');

    await addOrder('o2', 'SCOPED', { sellerId: 'other' });
    expect(await availableIds('a')).not.toContain('scoped');
  });

  it('未登入時仍不列出有每人限用次數的券', async () => {
    expect(await availableIds(null)).toEqual(['anyone']);
  });
});
