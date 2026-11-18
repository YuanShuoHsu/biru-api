import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { createPGlite } from '../../test/pglite.js';
import type { InventoryReportPageQueryDto } from './dto/inventory-report.dto.js';
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
    amounts: Partial<Record<string, string | null>>,
  ) => ({
    ingredientId,
    name: { 'zh-TW': ingredientId },
    unitCode,
    opening: '0.000',
    received: '0.000',
    consumed: '0.000',
    wasted: '0.000',
    wastedCost: '0.00',
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
    service = new InventoryReportService(db as unknown as DrizzleDB);

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

  describe('分頁、排序與篩選', () => {
    const ids = async (
      query: Partial<InventoryReportPageQueryDto>,
      canReadPurchasing = true,
    ) => {
      const report = await service.getInventoryReport(
        'biru',
        { ...range, ...query },
        canReadPurchasing,
      );

      return {
        ...report,
        ids: report.rows.map(({ ingredientId }) => ingredientId),
      };
    };

    it('沒有 limit 時回傳所有列，順序不變', async () => {
      const { ids: all, total } = await ids({});

      expect(all).toEqual(['milk', 'beans', 'oatmilk', 'cups']);
      expect(total).toBe(4);
    });

    it('數量字串依數值排序，limit／offset 取一頁，total 為篩選後的列數', async () => {
      expect((await ids({ sortBy: 'opening' })).ids).toEqual([
        'cups',
        'oatmilk',
        'beans',
        'milk',
      ]);

      const page = await ids({
        sortBy: 'opening',
        sortDirection: 'desc',
        limit: 2,
        offset: 1,
      });
      expect(page.ids).toEqual(['beans', 'oatmilk']);
      expect(page.total).toBe(4);
      expect(page.wasteByReason).toEqual((await ids({})).wasteByReason);

      const filtered = await ids({
        filterField: 'opening',
        filterOperator: '>=',
        filterValue: '500',
      });
      expect(filtered.ids).toEqual(['milk', 'beans']);
      expect(filtered.total).toBe(2);
    });

    it('依名稱快速搜尋，依單位列舉篩選', async () => {
      expect((await ids({ quickFilterValue: 'MILK' })).ids).toEqual([
        'milk',
        'oatmilk',
      ]);
      expect((await ids({ quickFilterEnums: ['unitCode:GRM'] })).ids).toEqual([
        'beans',
      ]);
      expect(
        (
          await ids({
            filterField: 'unitCode',
            filterOperator: 'not',
            filterValue: 'MLT',
          })
        ).ids,
      ).toEqual(['beans', 'cups']);
    });

    it('沒有 purchasing 權限時忽略依報廢成本的篩選與排序', async () => {
      expect(
        (
          await ids(
            {
              filterField: 'wastedCost',
              filterOperator: '>',
              filterValue: '0',
              sortBy: 'wastedCost',
              sortDirection: 'desc',
            },
            false,
          )
        ).ids,
      ).toEqual(['milk', 'beans', 'oatmilk', 'cups']);
    });
  });

  it('排序值與名稱相同時，依 id 排出固定順序', async () => {
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('tie', 'Tie', 'tie', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into ingredient (id, organization_id, name, unit_code, sort_order) values
         ('tie-b', 'tie', '{"zh-TW":"牛奶"}', 'MLT', 0),
         ('tie-a', 'tie', '{"zh-TW":"牛奶"}', 'MLT', 0);`,
    );

    const { rows } = await service.getInventoryReport('tie', range);

    expect(rows.map(({ ingredientId }) => ingredientId)).toEqual([
      'tie-a',
      'tie-b',
    ]);
  });

  it('不含不限量的食材', async () => {
    await client.query(
      `insert into ingredient (id, organization_id, name, unit_code, unlimited_stock)
       values ('water', 'org', '{"zh-TW":"water"}', 'MLT', true)`,
    );

    const { rows } = await service.getInventoryReport('biru', range);

    expect(rows.map(({ ingredientId }) => ingredientId)).not.toContain('water');
  });

  it('製作批次扣的原料計入耗用與理論耗用，產出計入進貨，不算盤點調整', async () => {
    await client.exec(
      `insert into ingredient (id, organization_id, name, unit_code, inventory_level, sort_order) values
         ('tomato', 'org', '{"zh-TW":"tomato"}', 'GRM', 1490, 4),
         ('sauce', 'org', '{"zh-TW":"sauce"}', 'GRM', 1000, 5);
       insert into inventory_transaction (id, ingredient_id, organization_id, quantity, production_batch_id, created_at) values
         ('tomato-stock', 'tomato', 'org', 2000, null, '2026-10-19T02:00:00Z'::timestamptz at time zone 'UTC'),
         ('tomato-batch', 'tomato', 'org', -500, 'batch', '2026-10-20T02:00:00Z'::timestamptz at time zone 'UTC'),
         ('sauce-batch', 'sauce', 'org', 1000, 'batch', '2026-10-20T02:00:00Z'::timestamptz at time zone 'UTC'),
         ('tomato-loss', 'tomato', 'org', -10, null, '2026-10-20T03:00:00Z'::timestamptz at time zone 'UTC');`,
    );

    const { rows } = await service.getInventoryReport('biru', {
      since: '2026-10-20T00:00:00+08:00',
      until: '2026-10-21T00:00:00+08:00',
    });

    expect(
      rows.filter(({ ingredientId }) =>
        ['tomato', 'sauce'].includes(ingredientId),
      ),
    ).toEqual([
      row('tomato', 'GRM', {
        opening: '2000.000',
        consumed: '500.000',
        adjusted: '-10.000',
        closing: '1490.000',
        theoreticalConsumption: '500.000',
        actualConsumption: '510.000',
        variance: '10.000',
      }),
      row('sauce', 'GRM', { received: '1000.000', closing: '1000.000' }),
    ]);
  });

  describe('報廢', () => {
    const day = {
      since: '2026-10-22T00:00:00+08:00',
      until: '2026-10-23T00:00:00+08:00',
    };

    beforeAll(async () => {
      await client.exec(
        `insert into ingredient (id, organization_id, name, unit_code, inventory_level, sort_order) values
         ('cream', 'org', '{"zh-TW":"cream"}', 'MLT', 660, 6),
         ('sugar', 'org', '{"zh-TW":"sugar"}', 'GRM', 95, 7);
       insert into ingredient (id, organization_id, name, unit_code, unlimited_stock) values
         ('ice', 'org', '{"zh-TW":"ice"}', 'GRM', true);
       insert into inventory_transaction (id, ingredient_id, organization_id, quantity, waste_reason, waste_batch_id, unit_cost, created_at) values
         ('cream-stock', 'cream', 'org', 1000, null, null, 0.05, '2026-10-21T02:00:00Z'::timestamptz at time zone 'UTC'),
         ('sugar-stock', 'sugar', 'org', 100, null, null, null, '2026-10-21T02:00:00Z'::timestamptz at time zone 'UTC'),
         ('cream-expired', 'cream', 'org', -300, 'expired', null, 0.05, '2026-10-22T02:00:00Z'::timestamptz at time zone 'UTC'),
         ('cream-spilled', 'cream', 'org', -20, 'spilled', null, 0.05, '2026-10-22T02:30:00Z'::timestamptz at time zone 'UTC'),
         ('cream-wrong', 'cream', 'org', -10, 'madeWrong', 'wrong-latte', 0.05, '2026-10-22T03:00:00Z'::timestamptz at time zone 'UTC'),
         ('sugar-wrong', 'sugar', 'org', -5, 'madeWrong', 'wrong-latte', null, '2026-10-22T03:00:00Z'::timestamptz at time zone 'UTC'),
         ('cream-loss', 'cream', 'org', -10, null, null, null, '2026-10-22T04:00:00Z'::timestamptz at time zone 'UTC'),
         ('ice-expired', 'ice', 'org', -100, 'expired', null, 0.05, '2026-10-22T05:00:00Z'::timestamptz at time zone 'UTC');`,
      );
    });

    it('報廢另列為報廢量與成本，不算進調整與實際耗用，差異只剩盤點調減；成品報廢的多筆異動算一次，依原因彙總和明細一樣不含不限量的食材', async () => {
      const { rows, wasteByReason } = await service.getInventoryReport(
        'biru',
        day,
        true,
      );

      expect(
        rows.filter(({ ingredientId }) =>
          ['cream', 'sugar'].includes(ingredientId),
        ),
      ).toEqual([
        row('cream', 'MLT', {
          opening: '1000.000',
          wasted: '330.000',
          wastedCost: '16.50',
          adjusted: '-10.000',
          closing: '660.000',
          actualConsumption: '10.000',
          variance: '10.000',
        }),
        row('sugar', 'GRM', {
          opening: '100.000',
          wasted: '5.000',
          wastedCost: null,
          closing: '95.000',
        }),
      ]);
      expect(wasteByReason).toEqual([
        { reason: 'expired', occurrences: 1, cost: '15.00' },
        { reason: 'spilled', occurrences: 1, cost: '1.00' },
        { reason: 'madeWrong', occurrences: 1, cost: null },
      ]);
    });

    it('沒有 purchasing 權限時不回傳報廢成本', async () => {
      const { rows, wasteByReason } = await service.getInventoryReport(
        'biru',
        day,
        false,
      );

      expect(rows.every((row) => !('wastedCost' in row))).toBe(true);
      expect(wasteByReason).toEqual([
        { reason: 'expired', occurrences: 1 },
        { reason: 'spilled', occurrences: 1 },
        { reason: 'madeWrong', occurrences: 1 },
      ]);
    });

    it('每個食材的期末等於期初加入庫減耗用減報廢加調整，實際耗用等於期初加入庫減報廢減期末', async () => {
      const { rows } = await service.getInventoryReport('biru', {
        since: '2026-09-25T00:00:00+08:00',
        until: '2026-10-24T00:00:00+08:00',
      });
      const amount = (value: string) => Math.round(Number(value) * 1000);

      expect(rows.some(({ wasted }) => amount(wasted) > 0)).toBe(true);
      for (const row of rows) {
        expect(amount(row.closing)).toBe(
          amount(row.opening) +
            amount(row.received) -
            amount(row.consumed) -
            amount(row.wasted) +
            amount(row.adjusted),
        );
        expect(amount(row.actualConsumption)).toBe(
          amount(row.opening) +
            amount(row.received) -
            amount(row.wasted) -
            amount(row.closing),
        );
        expect(amount(row.variance)).toBe(
          amount(row.actualConsumption) - amount(row.theoreticalConsumption),
        );
      }
    });
  });

  it('理論耗用計入品項與加料上客製選項的食譜', async () => {
    await client.exec(
      `insert into modifier_group (id, menu_id, display_name) values ('flavor', 'menu', '{"zh-TW":"口味"}');
       insert into modifier (id, modifier_group_id, display_name) values
         ('vanilla', 'flavor', '{"zh-TW":"香草"}'),
         ('plain', 'flavor', '{"zh-TW":"原味"}');
       insert into ingredient (id, organization_id, name, unit_code, inventory_level, sort_order) values
         ('syrup', 'org', '{"zh-TW":"syrup"}', 'MLT', 940, 6);
       insert into recipe (id, organization_id, modifier_id, name) values
         ('vanilla-recipe', 'org', 'vanilla', '{"zh-TW":"香草"}');
       insert into recipe_ingredient (id, recipe_id, ingredient_id, required_quantity) values
         ('vanilla-syrup', 'vanilla-recipe', 'syrup', 10);`,
    );
    await addOrder('flavored', 'OrderDelivered');
    await client.query(
      `insert into order_item (id, order_id, menu_item_id, menu_item_name, order_quantity, unit_price, add_ons, modifiers)
       values ('flavored-latte', 'flavored', 'latte', '拿鐵', 3, 50, $1, $2)`,
      [
        JSON.stringify([
          {
            menuItemId: 'oat',
            menuItemName: '燕麥奶',
            unitPrice: 0,
            modifiers: [{ modifierId: 'vanilla' }],
          },
        ]),
        JSON.stringify([{ modifierId: 'vanilla' }, { modifierId: 'plain' }]),
      ],
    );
    await addTransaction('syrup-stock', 'syrup', 1000, '2026-10-24T02:00:00Z');
    await addTransaction(
      'syrup-flavored',
      'syrup',
      -60,
      '2026-10-25T02:00:00Z',
      'flavored',
    );

    const { rows } = await service.getInventoryReport('biru', {
      since: '2026-10-25T00:00:00+08:00',
      until: '2026-10-26T00:00:00+08:00',
    });

    expect(rows.find(({ ingredientId }) => ingredientId === 'syrup')).toEqual(
      row('syrup', 'MLT', {
        opening: '1000.000',
        consumed: '60.000',
        closing: '940.000',
        theoreticalConsumption: '60.000',
        actualConsumption: '60.000',
      }),
    );
  });

  it('結束時間不晚於起始時間時拒絕', async () => {
    await expect(
      service.getInventoryReport('biru', {
        since: range.until,
        until: range.since,
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'rangeInvalid' },
    });
  });

  it('區間超過 366 天時拒絕', async () => {
    await expect(
      service.getInventoryReport('biru', {
        since: '2025-01-01T00:00:00+08:00',
        until: '2026-01-03T00:00:00+08:00',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'rangeTooLong' },
    });
  });

  it('門市不存在時回 404 並帶 organizationNotFound', async () => {
    await expect(
      service.getInventoryReport('missing', range),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'organizationNotFound' },
    });
  });
});
