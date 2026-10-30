import { PGlite } from '@electric-sql/pglite';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../../test/pglite.js';
import * as schema from '../../db/schema/index.js';
import { invoice } from '../../db/schema/invoices.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';

import { EcpayRejectedError } from '../utils/ecpay.js';

import { EcpayOrderInvoiceService } from './ecpay-order-invoice.service.js';

vi.mock('../utils/ecpay.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/ecpay.js')>()),
  sleep: () => Promise.resolve(),
}));

const ORG = 'org';

describe('EcpayOrderInvoiceService 開立中發票對帳（PGlite）', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: EcpayOrderInvoiceService;
  let getIssue: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    getIssue = vi.fn();
    service = new EcpayOrderInvoiceService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      { getIssue } as never,
      {} as never,
      { hasPrinter: () => Promise.resolve(false) } as never,
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
    getIssue.mockReset();
    vi.spyOn(
      service as unknown as { issueQuietly: () => unknown },
      'issueQuietly',
    ).mockResolvedValue(undefined);
  });

  const addIssuing = async (
    id: string,
    minutesAgo: number,
    relateNumber: string | null = id,
  ) => {
    await client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, payment_date, order_status)
       values ($1, '{"name":"客人"}', 'dineIn', $1, 'Cash', $2, 100, now(), 'OrderDelivered')`,
      [id, ORG],
    );
    await db.insert(invoice).values({
      id,
      orderId: id,
      relateNumber,
      status: 'issuing',
      type: 'personal',
      updatedAt: new Date(Date.now() - minutesAgo * 60_000),
    });
  };

  const queried = () =>
    getIssue.mock.calls.map(
      ([query]) => (query as { RelateNumber: string }).RelateNumber,
    );

  const statuses = async () =>
    (await client.query('select id, status from invoice order by id')).rows;

  it('從最久沒更新的開立中發票開始查證', async () => {
    getIssue.mockRejectedValue(new EcpayRejectedError('查無資料'));
    for (let index = 0; index < 21; index++)
      await addIssuing(`r-${String(index).padStart(2, '0')}`, 30 + index);

    await service.retryPendingInvoices();

    expect(queried()).toEqual(
      Array.from(
        { length: 20 },
        (_, index) => `r-${String(20 - index).padStart(2, '0')}`,
      ),
    );
  });

  it('查證不出結果的發票排到最後，下一輪輪到其他卡住的發票', async () => {
    getIssue.mockRejectedValue(new EcpayRejectedError('查無資料'));
    for (let index = 0; index < 20; index++)
      await addIssuing(`old-${String(index).padStart(2, '0')}`, 60 + index);
    await addIssuing('newer', 30);

    await service.retryPendingInvoices();
    getIssue.mockClear();
    await service.retryPendingInvoices();

    expect(queried()).toEqual(['newer']);
  });

  it('綠界拒絕或連線失敗都維持開立中，不放回待開立', async () => {
    getIssue
      .mockRejectedValueOnce(new EcpayRejectedError('查無資料'))
      .mockRejectedValueOnce(new Error('socket hang up'));
    await addIssuing('rejected', 60);
    await addIssuing('unreachable', 30);

    await service.retryPendingInvoices();

    expect(await statuses()).toEqual([
      { id: 'rejected', status: 'issuing' },
      { id: 'unreachable', status: 'issuing' },
    ]);
  });

  it('沒有 RelateNumber 的發票不佔查證名額，也不放回待開立', async () => {
    getIssue.mockRejectedValue(new EcpayRejectedError('查無資料'));
    for (let index = 0; index < 20; index++)
      await addIssuing(`legacy-${String(index).padStart(2, '0')}`, 60, null);
    await addIssuing('verifiable', 30);

    await service.retryPendingInvoices();

    expect(queried()).toEqual(['verifiable']);
    expect(
      (
        await client.query(
          `select count(*)::int as count from invoice where status = 'issuing' and relate_number is null`,
        )
      ).rows,
    ).toEqual([{ count: 20 }]);
  });

  it('綠界已開立就補上發票號碼', async () => {
    getIssue.mockResolvedValue({
      IIS_Create_Date: '2026-10-29 10:00:00',
      IIS_Number: 'AB12345678',
      IIS_Random_Number: '1234',
    });
    await addIssuing('found', 30);

    await service.retryPendingInvoices();

    expect(
      (
        await client.query(
          'select status, invoice_number, random_number from invoice',
        )
      ).rows,
    ).toEqual([
      { status: 'issued', invoice_number: 'AB12345678', random_number: '1234' },
    ]);
  });
});
