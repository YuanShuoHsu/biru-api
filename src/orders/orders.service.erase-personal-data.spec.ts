import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { OrdersService } from './orders.service.js';

describe('OrdersService.erasePersonalData', () => {
  let client: PGlite;
  let service: OrdersService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
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

    const contact = `'{"name":"王小明","email":"ming@example.com","telephone":"+886912345678","remark":"少冰"}'`;
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "user" (id, name, first_name, email, lang) values ('amy', 'Amy', 'Amy', 'amy@example.com', 'zh-TW');
       insert into "order" (id, customer, mode, order_number, order_status, payment_method, seller_id, subtotal, user_id, idempotency_fingerprint, updated_at) values
         ('old-guest', ${contact}, 'pickup', '1', 'OrderDelivered', 'Cash', 'org', 100, null, 'hash', now() - interval '31 days'),
         ('old-cancelled', ${contact}, 'pickup', '2', 'OrderCancelled', 'Cash', 'org', 100, null, null, now() - interval '31 days'),
         ('old-name-only', '{"name":"Lin"}', 'pickup', '3', 'OrderDelivered', 'Cash', 'org', 100, null, null, now() - interval '31 days'),
         ('recent-guest', ${contact}, 'pickup', '4', 'OrderDelivered', 'Cash', 'org', 100, null, null, now() - interval '29 days'),
         ('old-open', ${contact}, 'pickup', '5', 'OrderProcessing', 'Cash', 'org', 100, null, null, now() - interval '31 days'),
         ('old-member', ${contact}, 'pickup', '6', 'OrderDelivered', 'Cash', 'org', 100, 'amy', null, now() - interval '31 days'),
         ('old-pending-invoice', ${contact}, 'pickup', '7', 'OrderDelivered', 'Cash', 'org', 100, null, null, now() - interval '31 days'),
         ('old-voidable-invoice', ${contact}, 'pickup', '8', 'OrderDelivered', 'Cash', 'org', 100, null, null, now() - interval '31 days'),
         ('old-settled-invoice', ${contact}, 'pickup', '9', 'OrderDelivered', 'Cash', 'org', 100, null, null, now() - interval '31 days');
       insert into invoice (id, order_id, type, status, invoice_date) values
         ('pending', 'old-pending-invoice', 'personal', 'pending', null),
         ('voidable', 'old-voidable-invoice', 'personal', 'issued', now()),
         ('settled', 'old-settled-invoice', 'personal', 'issued', now() - interval '1 year');
       insert into audit_log (id, actor_name, actor_email, organization_id, resource, resource_id, action, changes, created_at) values
         ('audit-guest', 'Owner', 'owner@example.com', 'org', 'order', 'old-guest', 'update', '{"customer":{"before":{"name":"王小明"},"after":{"name":"王大明"}},"orderStatus":{"before":"OrderPickupAvailable","after":"OrderDelivered"}}', now()),
         ('audit-member', 'Owner', 'owner@example.com', 'org', 'order', 'old-member', 'update', '{"customer":{"before":{"name":"王小明"},"after":{"name":"王大明"}}}', now());`,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('keeps only a masked name on guest orders that ended over 30 days ago and whose invoice can no longer be issued or voided, and strips the customer from their audit log', async () => {
    expect(await service.erasePersonalData()).toBe(4);

    const { rows: orders } = await client.query<{
      id: string;
      customer: unknown;
      idempotency_fingerprint: string | null;
    }>('select id, customer, idempotency_fingerprint from "order" order by id');
    const contact = {
      name: '王小明',
      email: 'ming@example.com',
      telephone: '+886912345678',
      remark: '少冰',
    };
    expect(orders).toEqual([
      {
        id: 'old-cancelled',
        customer: { name: '王**' },
        idempotency_fingerprint: null,
      },
      {
        id: 'old-guest',
        customer: { name: '王**' },
        idempotency_fingerprint: null,
      },
      { id: 'old-member', customer: contact, idempotency_fingerprint: null },
      {
        id: 'old-name-only',
        customer: { name: 'L**' },
        idempotency_fingerprint: null,
      },
      { id: 'old-open', customer: contact, idempotency_fingerprint: null },
      {
        id: 'old-pending-invoice',
        customer: contact,
        idempotency_fingerprint: null,
      },
      {
        id: 'old-settled-invoice',
        customer: { name: '王**' },
        idempotency_fingerprint: null,
      },
      {
        id: 'old-voidable-invoice',
        customer: contact,
        idempotency_fingerprint: null,
      },
      { id: 'recent-guest', customer: contact, idempotency_fingerprint: null },
    ]);

    const { rows: audits } = await client.query<{
      id: string;
      changes: unknown;
    }>('select id, changes from audit_log order by id');
    expect(audits).toEqual([
      {
        id: 'audit-guest',
        changes: {
          orderStatus: {
            before: 'OrderPickupAvailable',
            after: 'OrderDelivered',
          },
        },
      },
      {
        id: 'audit-member',
        changes: {
          customer: { before: { name: '王小明' }, after: { name: '王大明' } },
        },
      },
    ]);
  });

  it('leaves an already erased order alone on the next run', async () => {
    expect(await service.erasePersonalData()).toBe(0);
  });
});
