import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { OrderPricingService } from '../orders/order-pricing.service.js';

import { CouponsService } from './coupons.service.js';

describe('CouponsService.update', () => {
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
    await client.exec('truncate coupon, organization cascade');
  });

  it('送 null 會清除最低消費、總量上限、每人上限與效期', async () => {
    const { id } = await service.create({
      code: 'LIMITED',
      discountType: 'fixed',
      discountValue: 50,
      discountCurrency: 'TWD',
      minSubtotal: 300,
      perUserLimit: 1,
      totalLimit: 100,
      validFrom: '2026-10-01T00:00:00Z',
      validThrough: '2026-12-31T00:00:00Z',
    });

    const cleared = await service.update(id, {
      minSubtotal: null,
      perUserLimit: null,
      totalLimit: null,
      validFrom: null,
      validThrough: null,
    });

    expect(cleared).toMatchObject({
      minSubtotal: null,
      perUserLimit: null,
      totalLimit: null,
      validFrom: null,
      validThrough: null,
    });
  });

  const codeExists = { status: 400, response: { code: 'codeExists' } };
  const skipCodeCheck = (lookupsBefore = 0) => {
    const original = db.query.coupon.findFirst.bind(db.query.coupon);
    const findFirst = vi.spyOn(db.query.coupon, 'findFirst');
    for (let i = 0; i < lookupsBefore; i++)
      findFirst.mockImplementationOnce(original);
    findFirst.mockResolvedValueOnce(undefined);
    onTestFinished(() => findFirst.mockRestore());
  };

  it('檢查後才被別人建立的同名優惠碼，建立時回 codeExists', async () => {
    await service.create({
      code: 'SUMMER',
      discountType: 'fixed',
      discountValue: 50,
      discountCurrency: 'TWD',
    });
    skipCodeCheck();

    await expect(
      service.create({
        code: 'summer',
        discountType: 'fixed',
        discountValue: 50,
        discountCurrency: 'TWD',
      }),
    ).rejects.toMatchObject(codeExists);
  });

  it('檢查後才被別人改成的同名優惠碼，更新時回 codeExists', async () => {
    await service.create({
      code: 'SUMMER',
      discountType: 'fixed',
      discountValue: 50,
      discountCurrency: 'TWD',
    });
    const { id } = await service.create({
      code: 'WINTER',
      discountType: 'fixed',
      discountValue: 50,
      discountCurrency: 'TWD',
    });
    skipCodeCheck(1);

    await expect(service.update(id, { code: 'Summer' })).rejects.toMatchObject(
      codeExists,
    );
  });

  const scheduleInvalid = {
    status: 400,
    response: { code: 'scheduleInvalid' },
  };
  const createWindow = () =>
    service.create({
      code: 'WINDOW',
      discountType: 'fixed',
      discountValue: 50,
      discountCurrency: 'TWD',
      validFrom: '2026-10-01T00:00:00Z',
      validThrough: '2026-12-31T00:00:00Z',
    });

  it('建立時效期開始不早於結束就拒絕', async () => {
    for (const validThrough of ['2026-10-01T00:00:00Z', '2026-12-31T00:00:00Z'])
      await expect(
        service.create({
          code: 'REVERSED',
          discountType: 'fixed',
          discountValue: 50,
          discountCurrency: 'TWD',
          validFrom: '2026-12-31T00:00:00Z',
          validThrough,
        }),
      ).rejects.toMatchObject(scheduleInvalid);
  });

  it('只改效期的一端時和既有的另一端一起檢查', async () => {
    const { id } = await createWindow();

    await expect(
      service.update(id, { validFrom: '2027-01-01T00:00:00Z' }),
    ).rejects.toMatchObject(scheduleInvalid);
    await expect(
      service.update(id, { validThrough: '2026-10-01T00:00:00Z' }),
    ).rejects.toMatchObject(scheduleInvalid);
    await expect(
      service.update(id, {
        validFrom: '2027-01-01T00:00:00Z',
        validThrough: null,
      }),
    ).resolves.toMatchObject({ validThrough: null });
    await expect(
      service.update(id, { validFrom: null }),
    ).resolves.toMatchObject({ validFrom: null });
  });

  it('沒送效期的更新不檢查既有效期', async () => {
    const { id } = await createWindow();
    await client.exec(
      `update coupon set valid_from = valid_through + interval '1 day' where id = '${id}'`,
    );

    await expect(
      service.update(id, { isActive: false }),
    ).resolves.toMatchObject({ isActive: false });
  });

  it('改回整單券時清除原本指定的品項與分類', async () => {
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org', 'org', 'org', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
    );
    const { id } = await service.create({
      applicableOrganizationIds: ['org'],
      code: 'ITEM',
      discountType: 'fixed',
      discountValue: 20,
      discountCurrency: 'TWD',
      menuItemIds: ['latte'],
      menuSectionIds: ['coffee'],
      scope: 'item',
    });

    const updated = await service.update(id, { scope: 'order' });

    expect(updated).toMatchObject({
      menuItemIds: null,
      menuSectionIds: null,
      scope: 'order',
    });
  });

  it('沒送的欄位維持原值', async () => {
    const { id } = await service.create({
      code: 'KEEP',
      discountType: 'fixed',
      discountValue: 50,
      discountCurrency: 'TWD',
      minSubtotal: 300,
      totalLimit: 100,
    });

    const updated = await service.update(id, { discountValue: 60 });

    expect(updated).toMatchObject({
      discountValue: '60.00',
      minSubtotal: '300.00',
      totalLimit: 100,
    });
  });
});
