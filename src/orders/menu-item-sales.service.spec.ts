import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { createPGlite } from '../../test/pglite.js';
import { MenuItemSalesService } from './menu-item-sales.service.js';

describe('MenuItemSalesService', () => {
  let client: PGlite;
  let service: MenuItemSalesService;

  const menuItemIds = Array.from(
    { length: 12 },
    (_, i) => `item-${String(i).padStart(2, '0')}`,
  );
  const soldOf = (index: number) => (index % 2 === 0 ? 2 : 1);

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new MenuItemSalesService(db as unknown as DrizzleDB);

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, order_date) values
         ('o1', '{"name":"客人"}', 'counter', '1', 'OrderDelivered', 'Cash', 'org', 100, '2026-10-02T02:00:00'),
         ('o2', '{"name":"客人"}', 'counter', '2', 'OrderDelivered', 'Cash', 'org', 100, '2026-10-02T03:00:00');`,
    );
    for (const [index, menuItemId] of [...menuItemIds.entries()].reverse()) {
      await client.query(
        `insert into order_item (id, order_id, menu_item_id, menu_item_name, order_quantity, unit_price)
         values ($1, $2, $1, $1, $3, 10)`,
        [menuItemId, index % 2 === 0 ? 'o1' : 'o2', soldOf(index)],
      );
    }
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('orders items with equal sales by menuItemId so the top N stays stable', async () => {
    const rows = await service.querySales(
      'org',
      new Date('2026-10-01T00:00:00Z'),
    );

    expect(rows.map(({ menuItemId }) => menuItemId)).toEqual([
      ...menuItemIds.filter((_, index) => soldOf(index) === 2),
      ...menuItemIds.filter((_, index) => soldOf(index) === 1),
    ]);
  });
});
