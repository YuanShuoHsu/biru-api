import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { createPGlite } from '../../test/pglite.js';
import {
  BreakEvenReportService,
  breakEvenRevenueOf,
} from './break-even-report.service.js';
import type { BreakEvenReportPageQueryDto } from './dto/break-even-report.dto.js';
import { PersonnelCostReportService } from './personnel-cost-report.service.js';
import { SalesReportService } from './sales-report.service.js';

describe('breakEvenRevenueOf', () => {
  it('grosses the fixed cost up by the contribution left after tax and cost of goods', () => {
    expect(breakEvenRevenueOf(70000, 0.3)).toBe(105000);
  });

  it('is null without a cost of goods rate or without any contribution', () => {
    expect(breakEvenRevenueOf(70000, null)).toBeNull();
    expect(breakEvenRevenueOf(70000, 1)).toBeNull();
    expect(breakEvenRevenueOf(70000, 1.2)).toBeNull();
  });
});

describe('BreakEvenReportService', () => {
  let client: PGlite;
  let service: BreakEvenReportService;

  const now = new Date('2026-10-20T04:00:00Z');
  const october = { month: '2026-10' } as BreakEvenReportPageQueryDto;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema }) as unknown as DrizzleDB;
    await migrate(drizzle(client, { schema }), {
      migrationsFolder: './drizzle',
    });
    service = new BreakEvenReportService(
      db,
      new PersonnelCostReportService(db),
      new SalesReportService(db),
    );

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address, opening_hours) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段', 'Mo-Sa 08:00-17:00'),
         ('empty', 'Empty', 'empty', now(), 'TW', '桃園市', '大園區', '中正東路一段', null);
       insert into menu (id, organization_id, name) values ('menu', 'org', '{"zh-TW":"菜單"}');
       insert into menu_item (id, menu_id, name) values
         ('latte', 'menu', '{"zh-TW":"拿鐵"}'),
         ('cake', 'menu', '{"zh-TW":"蛋糕"}'),
         ('cookie', 'menu', '{"zh-TW":"餅乾"}');
       insert into modifier_group (id, menu_id, display_name) values ('milk', 'menu', '{"zh-TW":"奶類"}');
       insert into modifier (id, modifier_group_id, display_name) values
         ('oat', 'milk', '{"zh-TW":"燕麥奶"}'),
         ('less-ice', 'milk', '{"zh-TW":"少冰"}');
       insert into ingredient (id, organization_id, name, unit_code, price, eligible_quantity, eligible_quantity_unit_code) values
         ('beans', 'org', '{"zh-TW":"咖啡豆"}', 'GRM', 1000, 1000, 'GRM'),
         ('oatmilk', 'org', '{"zh-TW":"燕麥奶"}', 'MLT', 100, 1000, 'MLT'),
         ('butter', 'org', '{"zh-TW":"奶油"}', 'GRM', null, null, null);
       insert into recipe (id, organization_id, menu_item_id, modifier_id, name, recipe_yield) values
         ('latte-recipe', 'org', 'latte', null, '{"zh-TW":"拿鐵"}', 1),
         ('cookie-recipe', 'org', 'cookie', null, '{"zh-TW":"餅乾"}', 1),
         ('oat-recipe', 'org', null, 'oat', '{"zh-TW":"燕麥奶"}', 2);
       insert into recipe_ingredient (id, recipe_id, ingredient_id, required_quantity) values
         ('latte-beans', 'latte-recipe', 'beans', 20),
         ('cookie-butter', 'cookie-recipe', 'butter', 10),
         ('oat-oatmilk', 'oat-recipe', 'oatmilk', 200);
       insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, order_date) values
         ('o1', '{"name":"客人"}', 'counter', '1', 'OrderDelivered', 'Cash', 'org', 315, '2026-10-05T02:00:00Z'::timestamptz at time zone 'UTC'),
         ('o2', '{"name":"客人"}', 'counter', '2', 'OrderDelivered', 'Cash', 'org', 105, '2026-09-30T02:00:00Z'::timestamptz at time zone 'UTC');
       insert into order_item (id, order_id, menu_item_id, menu_item_name, order_quantity, unit_price, modifiers) values
         ('o1-latte', 'o1', 'latte', '拿鐵', 2, 105, '[{"modifierGroupId":"milk","modifierGroupName":"奶類","modifierId":"oat","modifierName":"燕麥奶","priceAdjustment":null},{"modifierGroupId":"milk","modifierGroupName":"奶類","modifierId":"less-ice","modifierName":"少冰","priceAdjustment":null}]'),
         ('o1-cake', 'o1', 'cake', '蛋糕', 1, 105, null),
         ('o2-latte', 'o2', 'latte', '拿鐵', 1, 105, null);
       insert into operating_cost (id, organization_id, category, effective_from, monthly_amount) values
         ('rent-old', 'org', 'rent', '2026-01', 60000),
         ('rent-new', 'org', 'rent', '2026-11', 70000),
         ('power', 'org', 'electricity', '2026-10', 8000),
         ('water-old', 'org', 'water', '2026-01', 1000),
         ('water-stop', 'org', 'water', '2026-09', 0),
         ('staff', 'org', 'personnel', '2026-09', 120000),
         ('other-store', 'empty', 'rent', '2026-01', 50000);`,
    );
  });

  afterAll(async () => {
    await client.close();
  });

  it('uses the latest fixed cost of each category in force for the month and the personnel estimate without payslips', async () => {
    const report = await service.getBreakEvenReport('biru', october, now);

    expect(report.fixedCosts).toEqual([
      { category: 'rent', effectiveFrom: '2026-01', amount: 60000 },
      { category: 'electricity', effectiveFrom: '2026-10', amount: 8000 },
    ]);
    expect(report.personnel).toEqual({
      source: 'estimate',
      amount: 120000,
      unpublishedEmployees: 0,
    });
    expect(report.fixedCostTotal).toBe(188000);
  });

  it('splits the business tax out of the month revenue and prices items by their recipes', async () => {
    const report = await service.getBreakEvenReport('biru', october, now);

    expect(report).toMatchObject({
      revenue: 315,
      businessTax: 15,
      salesExcludingTax: 300,
      costOfGoodsSold: 60,
      unpricedItems: 1,
      costOfGoodsSoldRate: 0.3,
      grossMarginRate: 0.7,
      netProfit: -187760,
      total: 2,
    });
    expect(report.rows).toEqual([
      {
        menuItemId: 'latte',
        name: '拿鐵',
        quantity: 2,
        revenue: 200,
        cost: 60,
        grossProfit: 140,
        grossMarginRate: 0.7,
      },
      {
        menuItemId: 'cake',
        name: '蛋糕',
        quantity: 1,
        revenue: 100,
        cost: null,
        grossProfit: null,
        grossMarginRate: null,
      },
    ]);
  });

  it('divides the break-even and target revenue over the open days of the month', async () => {
    const report = await service.getBreakEvenReport(
      'biru',
      {
        month: '2026-10',
        targetProfit: '50000',
      } as BreakEvenReportPageQueryDto,
      now,
    );

    expect(report).toMatchObject({
      openDays: 27,
      remainingOpenDays: 11,
      breakEvenRevenue: 282000,
      dailyBreakEvenRevenue: 10444.44,
      remainingDailyBreakEvenRevenue: 25607.73,
      targetProfit: 50000,
      targetRevenue: 357000,
      dailyTargetRevenue: 13222.22,
    });
  });

  it('has no break-even without sales whose cost is known', async () => {
    const report = await service.getBreakEvenReport(
      'empty',
      october,
      new Date('2026-11-02T04:00:00Z'),
    );

    expect(report).toMatchObject({
      openDays: 31,
      remainingOpenDays: 0,
      fixedCostTotal: 50000,
      revenue: 0,
      costOfGoodsSoldRate: null,
      breakEvenRevenue: null,
      dailyBreakEvenRevenue: null,
      remainingDailyBreakEvenRevenue: null,
      targetRevenue: null,
      netProfit: -50000,
      rows: [],
    });
    expect(report.personnel.source).toBe('none');
  });
});
