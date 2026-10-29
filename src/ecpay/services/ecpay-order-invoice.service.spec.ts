import { PGlite } from '@electric-sql/pglite';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../../test/pglite.js';
import * as schema from '../../db/schema/index.js';
import { invoice } from '../../db/schema/invoices.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';

import { EcpayOrderInvoiceService } from './ecpay-order-invoice.service.js';

vi.mock('../utils/ecpay.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/ecpay.js')>()),
  sleep: () => Promise.resolve(),
}));

const ORG = 'org';

describe('EcpayOrderInvoiceService.retryPendingInvoices（PGlite）', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: EcpayOrderInvoiceService;
  let issued: string[];

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new EcpayOrderInvoiceService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new EventEmitter2(),
      {} as never,
    );
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
    issued = [];
    vi.spyOn(
      service as unknown as { issueQuietly: (orderId: string) => unknown },
      'issueQuietly',
    ).mockImplementation((orderId) => {
      issued.push(orderId);
      return Promise.resolve();
    });
  });

  const addPending = async (
    id: string,
    minutesAgo: number,
    orderStatus = 'OrderDelivered',
  ) => {
    await client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, payment_date, order_status)
       values ($1, '{"name":"客人"}', 'dineIn', $1, 'Cash', $2, 100, now(), $3)`,
      [id, ORG, orderStatus],
    );
    await db.insert(invoice).values({
      id,
      orderId: id,
      type: 'personal',
      updatedAt: new Date(Date.now() - minutesAgo * 60_000),
    });
  };

  it('已全額退款的訂單不佔重試名額，其他待開立發票仍會重試', async () => {
    for (let index = 0; index < 20; index++)
      await addPending(`returned-${index}`, 120 + index, 'OrderReturned');
    await addPending('paid', 30);

    await service.retryPendingInvoices();

    expect(issued).toEqual(['paid']);
  });

  it('從最久沒更新的待開立發票開始重試', async () => {
    for (let index = 0; index < 21; index++)
      await addPending(`paid-${index}`, 30 + index);

    await service.retryPendingInvoices();

    expect(issued).toEqual(
      Array.from({ length: 20 }, (_, index) => `paid-${20 - index}`),
    );
  });
});
