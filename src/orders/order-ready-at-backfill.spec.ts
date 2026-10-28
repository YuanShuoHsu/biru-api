import { readFileSync } from 'node:fs';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';

import { createPGlite } from '../../test/pglite.js';

const backfill = readFileSync('./drizzle/0244_order_ready_at.sql', 'utf8')
  .split('--> statement-breakpoint')
  .find((statement) => statement.trim().startsWith('UPDATE'))!;

describe('order.ready_at 從異動紀錄回填', () => {
  let client: PGlite;

  const addOrder = (id: string, orderStatus: string) =>
    client.query(
      `insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal)
       values ($1, '{"name":"客人"}', 'counter', '1', $2, 'Cash', 'org', 100)`,
      [id, orderStatus],
    );

  const addStatusChange = (
    orderId: string,
    before: string,
    after: string,
    createdAt: string,
  ) =>
    client.query(
      `insert into audit_log (id, actor_name, actor_email, organization_id, resource, resource_id, action, changes, created_at)
       values (gen_random_uuid(), '店員', 'staff@example.com', 'org', 'order', $1, 'update', $2, $3)`,
      [orderId, JSON.stringify({ orderStatus: { before, after } }), createdAt],
    );

  beforeAll(async () => {
    client = createPGlite();
    await migrate(drizzle(client, { schema }), {
      migrationsFolder: './drizzle',
    });

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address)
       values ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');`,
    );

    await addOrder('ready-twice', 'OrderPickupAvailable');
    await addStatusChange(
      'ready-twice',
      'OrderProcessing',
      'OrderPickupAvailable',
      '2026-10-01 10:00:00',
    );
    await addStatusChange(
      'ready-twice',
      'OrderPickupAvailable',
      'OrderProcessing',
      '2026-10-01 10:01:00',
    );
    await addStatusChange(
      'ready-twice',
      'OrderProcessing',
      'OrderPickupAvailable',
      '2026-10-01 10:05:00',
    );

    await addOrder('delivered', 'OrderDelivered');
    await addStatusChange(
      'delivered',
      'OrderProcessing',
      'OrderPickupAvailable',
      '2026-10-01 11:00:00',
    );
    await addStatusChange(
      'delivered',
      'OrderDelivered',
      'OrderPickupAvailable',
      '2026-10-01 11:30:00',
    );

    await addOrder('back-to-processing', 'OrderProcessing');
    await addStatusChange(
      'back-to-processing',
      'OrderProcessing',
      'OrderPickupAvailable',
      '2026-10-01 12:00:00',
    );

    await addOrder('no-audit', 'OrderDelivered');

    await client.exec(backfill);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('只回填可取餐或已取餐的訂單，取最後一次由製作中轉可取餐的時間', async () => {
    const { rows } = await client.query<{ id: string; ready_at: string }>(
      `select id, to_char(ready_at, 'YYYY-MM-DD HH24:MI') as ready_at from "order" order by id`,
    );

    expect(rows).toEqual([
      { id: 'back-to-processing', ready_at: null },
      { id: 'delivered', ready_at: '2026-10-01 11:00' },
      { id: 'no-audit', ready_at: null },
      { id: 'ready-twice', ready_at: '2026-10-01 10:05' },
    ]);
  });
});
