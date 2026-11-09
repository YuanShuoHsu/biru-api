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
