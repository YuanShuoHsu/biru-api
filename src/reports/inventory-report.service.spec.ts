import { BadRequestException } from '@nestjs/common';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { createPGlite } from '../../test/pglite.js';
import { InventoryReportService } from './inventory-report.service.js';

describe('InventoryReportService', () => {
  let client: PGlite;
  let service: InventoryReportService;

  const range = {
    since: '2026-09-30T00:00:00+08:00',
    until: '2026-10-03T00:00:00+08:00',
  };

  const addOrder = (id: string, orderStatus: string, sellerId = 'org') =>
    client.query(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, order_date)
       values ($1, '{"name":"客人"}', 'counter', '1', $2, 'Cash', $3, 100, '2026-10-01T02:00:00Z'::timestamptz at time zone 'UTC')`,
      [id, orderStatus, sellerId],
    );

  const addTransaction = (
    id: string,
    ingredientId: string,
    quantity: number,
    createdAt: string,
    orderId: string | null = null,
    organizationId = 'org',
  ) =>
    client.query(
      `insert into inventory_transaction (id, ingredient_id, organization_id, quantity, order_id, created_at)
       values ($1, $2, $3, $4, $5, $6::timestamptz at time zone 'UTC')`,
      [id, ingredientId, organizationId, quantity, orderId, createdAt],
    );

  const row = (
    ingredientId: string,
    unitCode: string,
    amounts: Partial<Record<string, string>>,
  ) => ({
    ingredientId,
    name: { 'zh-TW': ingredientId },
    unitCode,
    opening: '0.000',
    received: '0.000',
    consumed: '0.000',
    adjusted: '0.000',
    closing: '0.000',
    theoreticalConsumption: '0.000',
    actualConsumption: '0.000',
    variance: '0.000',
    ...amounts,
  });

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new InventoryReportService(
      db as unknown as DrizzleDB,
      {
        t: (key: string) => key,
      } as unknown as I18nService<I18nTranslations>,
    );

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into menu (id, organization_id, name) values ('menu', 'org', '{"zh-TW":"菜單"}');
       insert into menu_item (id, menu_id, name) values
         ('latte', 'menu', '{"zh-TW":"拿鐵"}'),
         ('oat', 'menu', '{"zh-TW":"燕麥奶"}');
       insert into ingredient (id, organization_id, name, unit_code, inventory_level, sort_order) values
         ('milk', 'org', '{"zh-TW":"milk"}', 'MLT', 950, 0),
         ('beans', 'org', '{"zh-TW":"beans"}', 'GRM', 446, 1),
         ('oatmilk', 'org', '{"zh-TW":"oatmilk"}', 'MLT', 70, 2),
         ('cups', 'org', '{"zh-TW":"cups"}', 'H87', 0, 3),
         ('other-milk', 'other', '{"zh-TW":"other-milk"}', 'MLT', 250, 0);
       insert into recipe (id, organization_id, menu_item_id, name, recipe_yield) values
         ('latte-recipe', 'org', 'latte', '{"zh-TW":"拿鐵"}', 1),
         ('oat-recipe', 'org', 'oat', '{"zh-TW":"燕麥奶"}', 2);
       insert into recipe_ingredient (id, recipe_id, ingredient_id, required_quantity) values
         ('latte-milk', 'latte-recipe', 'milk', 200),
         ('latte-beans', 'latte-recipe', 'beans', 18),
         ('oat-oatmilk', 'oat-recipe', 'oatmilk', 30);`,
    );

    await addOrder('delivered', 'OrderDelivered');
    await addOrder('unpaid', 'OrderPaymentDue');
    await addOrder('cancelled', 'OrderCancelled');
    await addOrder('other-order', 'OrderDelivered', 'other');
    await client.exec(
      `insert into order_item (id, order_id, menu_item_id, menu_item_name, order_quantity, unit_price, add_ons) values
         ('delivered-latte', 'delivered', 'latte', '拿鐵', 2, 50, '[{"menuItemId":"oat","menuItemName":"燕麥奶","unitPrice":0,"modifiers":[]}]'),
         ('unpaid-latte', 'unpaid', 'latte', '拿鐵', 1, 50, '[]'),
         ('cancelled-latte', 'cancelled', 'latte', '拿鐵', 1, 50, '[]'),
         ('other-latte', 'other-order', 'latte', '拿鐵', 5, 50, '[]');
       insert into refund (id, order_id, amount, scope, channel, status, created_at, items) values
         ('partial', 'delivered', 50, 'partial', 'manual', 'refunded', '2026-10-02T03:00:00Z'::timestamptz at time zone 'UTC',
          '[{"orderItemId":"delivered-latte","quantity":1,"amount":50}]');`,
    );

    const transactions: Parameters<typeof addTransaction>[] = [
      ['milk-stock', 'milk', 1000, '2026-09-20T02:00:00Z'],
      ['beans-stock', 'beans', 500, '2026-09-20T02:00:00Z'],
      ['oat-stock', 'oatmilk', 100, '2026-09-20T02:00:00Z'],
      ['milk-in', 'milk', 500, '2026-10-01T01:00:00Z'],
      ['milk-delivered', 'milk', -400, '2026-10-01T02:00:00Z', 'delivered'],
      ['beans-delivered', 'beans', -36, '2026-10-01T02:00:00Z', 'delivered'],
      ['oat-delivered', 'oatmilk', -30, '2026-10-01T02:00:00Z', 'delivered'],
      ['milk-unpaid', 'milk', -200, '2026-10-01T03:00:00Z', 'unpaid'],
      ['beans-unpaid', 'beans', -18, '2026-10-01T03:00:00Z', 'unpaid'],
      ['milk-cancelled', 'milk', -200, '2026-10-01T04:00:00Z', 'cancelled'],
      ['beans-cancelled', 'beans', -18, '2026-10-01T04:00:00Z', 'cancelled'],
      ['milk-loss', 'milk', -50, '2026-10-02T02:00:00Z'],
      ['milk-later', 'milk', 100, '2026-10-05T02:00:00Z'],
      ['milk-restored', 'milk', 200, '2026-10-05T03:00:00Z', 'cancelled'],
      ['beans-restored', 'beans', 18, '2026-10-05T03:00:00Z', 'cancelled'],
      ['other-in', 'other-milk', 300, '2026-10-01T02:00:00Z', null, 'other'],
      [
        'other-out',
        'other-milk',
        -50,
        '2026-10-01T03:00:00Z',
        'other-order',
        'other',
      ],
    ];
    for (const transaction of transactions)
      await addTransaction(...transaction);
  });

  afterAll(() => client.close());

  it('區間前的異動計入期初，區間後的異動不影響期末；照配方出餐時只有盤點調減形成差異，未付款訂單與部分退款不造成差異', async () => {
    const { rows } = await service.getInventoryReport('biru', range);

    expect(rows).toEqual([
      row('milk', 'MLT', {
        opening: '1000.000',
        received: '500.000',
        consumed: '800.000',
        adjusted: '-50.000',
        closing: '650.000',
        theoreticalConsumption: '800.000',
        actualConsumption: '850.000',
        variance: '50.000',
      }),
      row('beans', 'GRM', {
        opening: '500.000',
        consumed: '72.000',
        closing: '428.000',
        theoreticalConsumption: '72.000',
        actualConsumption: '72.000',
      }),
      row('oatmilk', 'MLT', {
        opening: '100.000',
        consumed: '30.000',
        closing: '70.000',
        theoreticalConsumption: '30.000',
        actualConsumption: '30.000',
      }),
      row('cups', 'H87', {}),
    ]);
  });

  it('取消回補落在區間內時，耗用與理論耗用一起減回', async () => {
    const { rows } = await service.getInventoryReport('biru', {
      since: '2026-10-04T00:00:00+08:00',
      until: '2026-10-06T00:00:00+08:00',
    });

    expect(rows).toEqual([
      row('milk', 'MLT', {
        opening: '650.000',
        received: '100.000',
        consumed: '-200.000',
        closing: '950.000',
        theoreticalConsumption: '-200.000',
        actualConsumption: '-200.000',
      }),
      row('beans', 'GRM', {
        opening: '428.000',
        consumed: '-18.000',
        closing: '446.000',
        theoreticalConsumption: '-18.000',
        actualConsumption: '-18.000',
      }),
      row('oatmilk', 'MLT', { opening: '70.000', closing: '70.000' }),
      row('cups', 'H87', {}),
    ]);
  });

  it('區間內沒有異動時期初等於期末，其餘為 0', async () => {
    const { rows } = await service.getInventoryReport('biru', {
      since: '2026-10-10T00:00:00+08:00',
      until: '2026-10-11T00:00:00+08:00',
    });

    expect(rows).toEqual([
      row('milk', 'MLT', { opening: '950.000', closing: '950.000' }),
      row('beans', 'GRM', { opening: '446.000', closing: '446.000' }),
      row('oatmilk', 'MLT', { opening: '70.000', closing: '70.000' }),
      row('cups', 'H87', {}),
    ]);
  });

  it('不含其他店家的食材、異動與配方', async () => {
    const { rows } = await service.getInventoryReport('other', range);

    expect(rows).toEqual([
      row('other-milk', 'MLT', {
        received: '300.000',
        consumed: '50.000',
        closing: '250.000',
        actualConsumption: '50.000',
        variance: '50.000',
      }),
    ]);
  });

  it('結束時間不晚於起始時間時拒絕', async () => {
    await expect(
      service.getInventoryReport('biru', {
        since: range.until,
        until: range.since,
      }),
    ).rejects.toThrow(new BadRequestException('common.reports.rangeInvalid'));
  });

  it('區間超過 366 天時拒絕', async () => {
    await expect(
      service.getInventoryReport('biru', {
        since: '2025-01-01T00:00:00+08:00',
        until: '2026-01-03T00:00:00+08:00',
      }),
    ).rejects.toThrow(new BadRequestException('common.reports.rangeTooLong'));
  });
});
