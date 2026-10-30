import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../../test/pglite.js';
import * as schema from '../../db/schema/index.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';

import { EcpayAttentionService } from './ecpay-attention.service.js';

const ORG = 'org';

describe('EcpayAttentionService 逾時未開的發票', () => {
  let client: PGlite;
  let service: EcpayAttentionService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new EcpayAttentionService(db as unknown as DrizzleDB);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate invoice, "order", organization cascade');
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
    for (const [id, orderStatus, invoiceStatus] of [
      ['paid', 'OrderProcessing', 'pending'],
      ['problem', 'OrderProblem', 'pending'],
      ['problem-issuing', 'OrderProblem', 'issuing'],
    ]) {
      await client.query(
        `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, payment_date, order_status, reconciled_at)
         values ($1, '{"name":"客人"}', 'dineIn', $1, 'Credit', $2, 100, now(), $3, now())`,
        [id, ORG, orderStatus],
      );
      await client.query(
        `insert into invoice (id, order_id, type, email, status, created_at, updated_at)
         values ($1, $1, 'personal', 'a@example.com', $2, now() - interval '2 hours', now() - interval '2 hours')`,
        [id, invoiceStatus],
      );
    }
  });

  it('付款失敗的訂單留著付款時間，待開發票也不列為逾時；開立中的照列', async () => {
    const items = await service.findByOrganization('biru');

    expect(
      items
        .filter(({ type }) => type.startsWith('invoice'))
        .map(({ orderId, type }) => `${orderId}:${type}`)
        .sort(),
    ).toEqual(['paid:invoiceOverdue', 'problem-issuing:invoiceStuck']);
  });
});
