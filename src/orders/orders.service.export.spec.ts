import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { ORDER_EXPORT_MAX_ROWS, OrdersService } from './orders.service.js';

const actor = { id: 'staff', name: 'Staff', email: 'staff@example.com' };

describe('OrdersService.exportOrders', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: OrdersService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new OrdersService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const orders = Array.from(
      { length: 12 },
      (_, index) =>
        `('o${index + 1}', '{"name": "Amy ${index + 1}"}', '${index % 2 ? 'dineIn' : 'pickup'}', '${index + 1}', 'OrderDelivered', 'Cash', 'org', 100, now() - interval '${index} minutes', now())`,
    );
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, created_at, updated_at) values
         ${orders.join(',\n')},
         ('x1', '{"name": "Amy"}', 'pickup', '1', 'OrderDelivered', 'Cash', 'other', 100, now(), now());`,
    );
  }, 60_000);

  afterEach(async () => {
    await db.delete(schema.auditLog);
  });

  afterAll(async () => {
    await client.close();
  });

  it('輸出店內所有符合的訂單，不受列表分頁限制', async () => {
    const rows = await service.exportOrders('biru', {}, actor);

    expect(rows.map(({ orderNumber }) => orderNumber)).toEqual(
      Array.from({ length: 12 }, (_, index) => `${index + 1}`),
    );
  });

  it('套用列表的篩選、快速搜尋與排序', async () => {
    const rows = await service.exportOrders(
      'biru',
      {
        filterField: 'mode',
        filterOperator: 'is',
        filterValue: 'dineIn',
        quickFilterValue: 'Amy 1',
        sortBy: 'orderNumber',
        sortDirection: 'asc',
      },
      actor,
    );

    expect(rows.map(({ orderNumber }) => orderNumber)).toEqual(['10', '12']);
  });

  it.each([
    [
      '快速搜尋一律遮蔽',
      { quickFilterValue: 'Amy 1', sortBy: 'createdAt' },
      {
        quickFilterValue: { before: null, after: { redacted: true } },
        sortBy: { before: null, after: 'createdAt' },
        rowCount: { before: null, after: 4 },
      },
    ],
    [
      '篩選顧客欄位時遮蔽篩選值',
      {
        filterField: 'customerName',
        filterOperator: 'equals',
        filterValue: 'Amy 3',
      },
      {
        filterField: { before: null, after: 'customerName' },
        filterOperator: { before: null, after: 'equals' },
        filterValue: { before: null, after: { redacted: true } },
        rowCount: { before: null, after: 1 },
      },
    ],
    [
      '篩選其他欄位時照原樣記下',
      { filterField: 'mode', filterOperator: 'is', filterValue: 'dineIn' },
      {
        filterField: { before: null, after: 'mode' },
        filterOperator: { before: null, after: 'is' },
        filterValue: { before: null, after: 'dineIn' },
        rowCount: { before: null, after: 6 },
      },
    ],
  ] as const)(
    '把匯出者、篩選條件與筆數記進 audit_log（%s）',
    async (_, query, changes) => {
      await service.exportOrders('biru', query, actor);

      const logs = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, 'export'));
      expect(logs).toEqual([
        expect.objectContaining({
          actorId: 'staff',
          actorName: 'Staff',
          actorEmail: 'staff@example.com',
          organizationId: 'org',
          resource: 'order',
          resourceId: 'org',
          resourceLabel: 'Biru',
          changes,
        }),
      ]);
    },
  );

  it('符合的訂單超過上限時拒絕匯出，也不寫 audit_log', async () => {
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('big', 'Big', 'big', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, created_at, updated_at)
         select 'big' || n, '{}', 'pickup', n::text, 'OrderDelivered', 'Cash', 'big', 100, now(), now()
         from generate_series(1, ${ORDER_EXPORT_MAX_ROWS + 1}) as n;`,
    );

    await expect(service.exportOrders('big', {}, actor)).rejects.toMatchObject({
      response: { code: 'orderExportTooLarge' },
    });
    await expect(
      service.exportOrders(
        'big',
        {
          filterField: 'orderNumber',
          filterOperator: 'equals',
          filterValue: '1',
        },
        actor,
      ),
    ).resolves.toHaveLength(1);
    expect(
      await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.resourceId, 'big')),
    ).toHaveLength(1);
  });
});
