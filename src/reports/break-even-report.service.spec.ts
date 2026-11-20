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
import type { PayrollService } from '../payroll/payroll.service.js';
import type { PayrollSnapshot } from '../db/schema/payroll.js';
import { PersonnelCostReportService } from './personnel-cost-report.service.js';
import { SalesReportService } from './sales-report.service.js';

describe('breakEvenRevenueOf', () => {
  it('grosses the fixed cost up by the contribution left after cost of goods, payment fees and tax', () => {
    expect(breakEvenRevenueOf(70000, 0.3, null)).toBe(105000);
    expect(breakEvenRevenueOf(70000, 0.3, 0.2)).toBe(147000);
  });

  it('is null without a cost of goods rate or without any contribution', () => {
    expect(breakEvenRevenueOf(70000, null, 0.02)).toBeNull();
    expect(breakEvenRevenueOf(70000, 1, null)).toBeNull();
    expect(breakEvenRevenueOf(70000, 1.2, null)).toBeNull();
    expect(breakEvenRevenueOf(70000, 0.3, 0.7)).toBeNull();
  });
});

describe('BreakEvenReportService', () => {
  let client: PGlite;
  let service: BreakEvenReportService;
  let personnel: PersonnelCostReportService;
  const payroll = { estimateSnapshots: vi.fn() };

  const now = new Date('2026-10-20T04:00:00Z');
  const october = { month: '2026-10' } as BreakEvenReportPageQueryDto;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema }) as unknown as DrizzleDB;
    await migrate(drizzle(client, { schema }), {
      migrationsFolder: './drizzle',
    });
    personnel = new PersonnelCostReportService(db);
    service = new BreakEvenReportService(
      db,
      payroll as unknown as PayrollService,
      personnel,
      new SalesReportService(db),
    );

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address, opening_hours) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段', 'Mo-Sa 08:00-17:00'),
         ('empty', 'Empty', 'empty', now(), 'TW', '桃園市', '大園區', '中正東路一段', null),
         ('plan', 'Plan', 'plan', now(), 'TW', '桃園市', '大園區', '中正東路一段', null),
         ('tax', 'Tax', 'tax', now(), 'TW', '桃園市', '大園區', '中正東路一段', null);
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
       insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, order_date, merchant_trade_no) values
         ('o1', '{"name":"客人"}', 'counter', '1', 'OrderDelivered', 'Cash', 'org', 315, '2026-10-05T02:00:00Z'::timestamptz at time zone 'UTC', null),
         ('o2', '{"name":"客人"}', 'counter', '2', 'OrderDelivered', 'Cash', 'org', 105, '2026-09-30T02:00:00Z'::timestamptz at time zone 'UTC', null),
         ('o3', '{"name":"客人"}', 'pickup', '3', 'OrderDelivered', 'Credit', 'org', 105, '2026-10-06T02:00:00Z'::timestamptz at time zone 'UTC', 'm3'),
         ('o4', '{"name":"客人"}', 'pickup', '4', 'OrderDelivered', 'Credit', 'org', 105, '2026-10-07T02:00:00Z'::timestamptz at time zone 'UTC', 'm4');
       insert into ecpay_payment_attempt (merchant_trade_no, order_id, charge_fee) values
         ('m3-failed', 'o3', null),
         ('m3', 'o3', 3.15),
         ('m4', 'o4', null);
       insert into order_item (id, order_id, menu_item_id, menu_item_name, order_quantity, unit_price, modifiers) values
         ('o1-latte', 'o1', 'latte', '拿鐵', 2, 105, '[{"modifierGroupId":"milk","modifierGroupName":"奶類","modifierId":"oat","modifierName":"燕麥奶","priceAdjustment":null},{"modifierGroupId":"milk","modifierGroupName":"奶類","modifierId":"less-ice","modifierName":"少冰","priceAdjustment":null}]'),
         ('o1-cake', 'o1', 'cake', '蛋糕', 1, 105, null),
         ('o2-latte', 'o2', 'latte', '拿鐵', 1, 105, null),
         ('o3-latte', 'o3', 'latte', '拿鐵', 1, 105, null),
         ('o4-cake', 'o4', 'cake', '蛋糕', 1, 105, null);
       insert into menu (id, organization_id, name) values ('plan-menu', 'plan', '{"zh-TW":"菜單"}');
       insert into menu_item (id, menu_id, name) values
         ('plan-latte', 'plan-menu', '{"zh-TW":"拿鐵"}'),
         ('plan-steak', 'plan-menu', '{"zh-TW":"牛排"}'),
         ('plan-soup', 'plan-menu', '{"zh-TW":"湯"}'),
         ('plan-tea', 'plan-menu', '{"zh-TW":"茶"}');
       insert into offer (id, menu_item_id, price) values
         ('plan-latte-offer', 'plan-latte', 105),
         ('plan-steak-offer', 'plan-steak', 210),
         ('plan-soup-offer', 'plan-soup', 105);
       insert into ingredient (id, organization_id, name, unit_code, price, eligible_quantity, eligible_quantity_unit_code) values
         ('plan-beans', 'plan', '{"zh-TW":"咖啡豆"}', 'GRM', 1000, 1000, 'GRM'),
         ('plan-stock', 'plan', '{"zh-TW":"高湯"}', 'GRM', null, null, null);
       insert into recipe (id, organization_id, menu_item_id, name, recipe_yield) values
         ('plan-latte-recipe', 'plan', 'plan-latte', '{"zh-TW":"拿鐵"}', 1),
         ('plan-steak-recipe', 'plan', 'plan-steak', '{"zh-TW":"牛排"}', 1),
         ('plan-soup-recipe', 'plan', 'plan-soup', '{"zh-TW":"湯"}', 1),
         ('plan-tea-recipe', 'plan', 'plan-tea', '{"zh-TW":"茶"}', 1);
       insert into recipe_ingredient (id, recipe_id, ingredient_id, required_quantity) values
         ('plan-latte-beans', 'plan-latte-recipe', 'plan-beans', 30),
         ('plan-steak-beans', 'plan-steak-recipe', 'plan-beans', 20),
         ('plan-soup-stock', 'plan-soup-recipe', 'plan-stock', 100),
         ('plan-tea-beans', 'plan-tea-recipe', 'plan-beans', 5);
       insert into operating_cost (id, organization_id, category, effective_from, monthly_amount, input_tax_deductible) values
         ('rent-old', 'org', 'rent', '2026-01', 60000, false),
         ('rent-new', 'org', 'rent', '2026-11', 70000, false),
         ('power', 'org', 'electricity', '2026-10', 8000, false),
         ('water-old', 'org', 'water', '2026-01', 1000, false),
         ('water-stop', 'org', 'water', '2026-09', 0, false),
         ('staff', 'org', 'personnel', '2026-09', 120000, false),
         ('other-store', 'empty', 'rent', '2026-01', 50000, false),
         ('plan-rent', 'plan', 'rent', '2026-01', 50000, false),
         ('tax-rent', 'tax', 'rent', '2026-01', 30000, false),
         ('tax-power', 'tax', 'electricity', '2026-01', 10500, true);
       insert into supplier (id, organization_id, name, uniform_invoice) values ('tax-supplier', 'tax', '有發票的供應商', true);
       insert into menu (id, organization_id, name) values ('tax-menu', 'tax', '{"zh-TW":"菜單"}');
       insert into menu_item (id, menu_id, name) values ('tax-latte', 'tax-menu', '{"zh-TW":"拿鐵"}');
       insert into ingredient (id, organization_id, name, unit_code, price, eligible_quantity, eligible_quantity_unit_code, supplier_id) values
         ('tax-beans', 'tax', '{"zh-TW":"咖啡豆"}', 'GRM', 1050, 1000, 'GRM', 'tax-supplier');
       insert into recipe (id, organization_id, menu_item_id, name, recipe_yield) values ('tax-latte-recipe', 'tax', 'tax-latte', '{"zh-TW":"拿鐵"}', 1);
       insert into recipe_ingredient (id, recipe_id, ingredient_id, required_quantity) values ('tax-latte-beans', 'tax-latte-recipe', 'tax-beans', 20);
       insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, order_date, merchant_trade_no) values
         ('o5', '{"name":"客人"}', 'counter', '5', 'OrderDelivered', 'Cash', 'tax', 210, '2026-10-08T02:00:00Z'::timestamptz at time zone 'UTC', null),
         ('o6', '{"name":"客人"}', 'pickup', '6', 'OrderDelivered', 'Credit', 'tax', 105, '2026-10-08T03:00:00Z'::timestamptz at time zone 'UTC', 'm6');
       insert into ecpay_payment_attempt (merchant_trade_no, order_id, charge_fee) values ('m6', 'o6', 10.5);
       insert into order_item (id, order_id, menu_item_id, menu_item_name, order_quantity, unit_price, modifiers) values
         ('o5-latte', 'o5', 'tax-latte', '拿鐵', 2, 105, null),
         ('o6-latte', 'o6', 'tax-latte', '拿鐵', 1, 105, null);`,
    );
  });

  beforeEach(() => {
    payroll.estimateSnapshots.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await client.close();
  });

  it('uses the latest fixed cost of each category in force for the month and the personnel estimate without payslips', async () => {
    const report = await service.getBreakEvenReport('biru', october, now);

    expect(report.personnel).toEqual({
      source: 'estimate',
      amount: 120000,
      publishedEmployees: 0,
      scheduledEmployees: 0,
      unestimatedEmployees: 0,
    });
    expect(report.fixedCosts).toEqual([
      {
        category: 'rent',
        effectiveFrom: '2026-01',
        amount: 60000,
        inputTax: 0,
      },
      {
        category: 'electricity',
        effectiveFrom: '2026-10',
        amount: 8000,
        inputTax: 0,
      },
    ]);
    expect(report.fixedCostTotal).toBe(188000);
  });

  it('splits the business tax out of the month revenue and charges the recipes and the recorded payment fees', async () => {
    const report = await service.getBreakEvenReport('biru', october, now);

    expect(report).toMatchObject({
      revenue: 525,
      outputTax: 25,
      inputTax: 0.15,
      businessTaxPayable: 24.85,
      salesExcludingTax: 500,
      costOfGoodsSold: 80,
      unpricedItems: 1,
      paymentFees: 3.15,
      unknownFeeOrders: 1,
      preTaxProfit: -187583,
      incomeTax: 0,
      afterTaxProfit: -187583,
      total: 2,
    });
    expect(report.rows).toEqual([
      {
        menuItemId: 'latte',
        name: '拿鐵',
        quantity: 3,
        revenue: 300,
        cost: 80,
        grossProfit: 220,
        grossMarginRate: 0.7333,
      },
      {
        menuItemId: 'cake',
        name: '蛋糕',
        quantity: 2,
        revenue: 200,
        cost: null,
        grossProfit: null,
        grossMarginRate: null,
      },
    ]);
  });

  it('takes the cost and fee rates from the 90 days of sales up to now and the after-tax target', async () => {
    const report = await service.getBreakEvenReport(
      'biru',
      {
        month: '2026-10',
        targetProfit: '50000',
      } as BreakEvenReportPageQueryDto,
      now,
    );

    expect(report).toMatchObject({
      rateSince: '2026-07-22',
      rateUntil: '2026-10-20',
      costRateSource: 'sales',
      costOfGoodsSoldRate: 0.25,
      grossMarginRate: 0.75,
      paymentFeeRate: 0.006,
      openDays: 27,
      remainingOpenDays: 11,
      breakEvenRevenue: 265322.58,
      dailyBreakEvenRevenue: 9826.76,
      remainingDailyBreakEvenRevenue: 24072.51,
      targetProfit: 50000,
      targetPreTaxProfit: 62500,
      targetRevenue: 353528.23,
      dailyTargetRevenue: 13093.64,
    });
  });

  it('costs invoiced purchases, deductible fixed costs and payment fees without their input tax', async () => {
    const report = await service.getBreakEvenReport('tax', october, now);

    expect(report).toMatchObject({
      fixedCostTotal: 40000,
      revenue: 315,
      outputTax: 15,
      salesExcludingTax: 300,
      costOfGoodsSold: 60,
      paymentFees: 10.5,
      inputTax: 503.5,
      businessTaxPayable: -488.5,
      preTaxProfit: -39770,
      costOfGoodsSoldRate: 0.2,
      paymentFeeRate: 0.0333,
      breakEvenRevenue: 54780.23,
    });
    expect(report.fixedCosts).toContainEqual({
      category: 'electricity',
      effectiveFrom: '2026-01',
      amount: 10500,
      inputTax: 500,
    });
    expect(report.rows[0]).toMatchObject({ cost: 60, grossProfit: 240 });
  });

  it('adds the schedule estimates of employees without a published payslip to the published ones', async () => {
    vi.spyOn(personnel, 'monthCosts').mockResolvedValue({
      publishedCents: 3_000_000n,
      publishedEmployees: 1,
      unpublishedEmployeeIds: ['e2', 'e3'],
    });
    payroll.estimateSnapshots.mockResolvedValue([
      {
        employeeId: 'e2',
        snapshot: {
          grossCents: '2800000',
          employerCosts: [{ code: 'laborInsurance', amountCents: '300000' }],
          employerPensionCents: '168000',
        } as unknown as PayrollSnapshot,
      },
      { employeeId: 'e3', snapshot: null },
    ]);

    const report = await service.getBreakEvenReport('biru', october, now);

    expect(payroll.estimateSnapshots).toHaveBeenCalledWith('org', '2026-10', [
      'e2',
      'e3',
    ]);
    expect(report.personnel).toEqual({
      source: 'schedule',
      amount: 62680,
      publishedEmployees: 1,
      scheduledEmployees: 1,
      unestimatedEmployees: 1,
    });
    expect(report.fixedCostTotal).toBe(60000 + 8000 + 62680);
  });

  it('estimates the cost rate from the menu recipes before there are sales', async () => {
    const report = await service.getBreakEvenReport('plan', october, now);

    expect(report).toMatchObject({
      costRateSource: 'menu',
      costOfGoodsSoldRate: 0.2,
      paymentFeeRate: null,
      fixedCostTotal: 50000,
      breakEvenRevenue: 65625,
      dailyBreakEvenRevenue: 2116.94,
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
      costRateSource: null,
      costOfGoodsSoldRate: null,
      breakEvenRevenue: null,
      dailyBreakEvenRevenue: null,
      remainingDailyBreakEvenRevenue: null,
      targetRevenue: null,
      preTaxProfit: -50000,
      incomeTax: 0,
      afterTaxProfit: -50000,
      rows: [],
    });
    expect(report.personnel.source).toBe('none');
  });
});
