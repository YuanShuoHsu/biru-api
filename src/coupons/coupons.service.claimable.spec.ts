import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import { coupon, userCoupon } from '../db/schema/coupons.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { OrderPricingService } from '../orders/order-pricing.service.js';

import { CouponsService } from './coupons.service.js';

describe('CouponsService 可領取清單的總量', () => {
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
      'truncate user_coupon, coupon, "user", organization cascade',
    );
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org', '碧露', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
    );
    await client.query(
      `insert into "user" (id, name, email, first_name) values
        ('a', 'A', 'a@example.com', 'A'),
        ('b', 'B', 'b@example.com', 'B')`,
    );
    await db.insert(coupon).values([
      {
        code: 'FULL',
        discountType: 'fixed',
        discountValue: '50',
        id: 'full',
        isClaimable: true,
        totalLimit: 1,
      },
      {
        code: 'OPEN',
        discountType: 'fixed',
        discountValue: '50',
        id: 'open',
        isClaimable: true,
        totalLimit: 2,
      },
      {
        code: 'UNLIMITED',
        discountType: 'fixed',
        discountValue: '50',
        id: 'unlimited',
        isClaimable: true,
      },
    ]);
    await db.insert(userCoupon).values([
      { couponId: 'full', id: 'b-full', source: 'claimed', userId: 'b' },
      { couponId: 'open', id: 'b-open', source: 'claimed', userId: 'b' },
    ]);
  });

  it('已被領完的券不列在可領取清單', async () => {
    const ids = (await service.getAllClaimable('a')).map((c) => c.id).sort();
    expect(ids).toEqual(['open', 'unlimited']);
  });

  it('店家頁不列出已被別人領完的券，自己領到的仍標示已領取', async () => {
    const forA = await service.getClaimable('biru', 'a');
    expect(forA.map((c) => c.id).sort()).toEqual(['open', 'unlimited']);

    const forB = await service.getClaimable('biru', 'b');
    expect(
      forB.map((c) => [c.id, c.claimed]).sort(([x], [y]) => (x < y ? -1 : 1)),
    ).toEqual([
      ['full', true],
      ['open', true],
      ['unlimited', false],
    ]);

    const anonymous = await service.getClaimable('biru', null);
    expect(anonymous.map((c) => c.id).sort()).toEqual(['open', 'unlimited']);
  });
});
