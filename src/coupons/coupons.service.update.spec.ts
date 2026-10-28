import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import type { OrderPricingService } from '../orders/order-pricing.service.js';

import { CouponsService } from './coupons.service.js';

describe('CouponsService.update', () => {
  let client: PGlite;
  let service: CouponsService;

  beforeAll(async () => {
    client = new PGlite();
    const db = drizzle(client, { schema });
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
