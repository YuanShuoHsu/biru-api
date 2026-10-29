import { BadGatewayException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import { createPGlite } from '../../../test/pglite.js';
import * as schema from '../../db/schema/index.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../../generated/i18n.generated.js';

import { EcpayOrderInvoiceService } from './ecpay-order-invoice.service.js';

const ORG = 'org';

describe('EcpayOrderInvoiceService 只替已付款的訂單開發票', () => {
  let client: PGlite;
  let service: EcpayOrderInvoiceService;
  const issueInvoice = vi.fn();

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new EcpayOrderInvoiceService(
      db as unknown as DrizzleDB,
      { issueInvoice } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new EventEmitter2(),
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    issueInvoice.mockReset().mockRejectedValue(new BadGatewayException('x'));
    await client.exec(
      'truncate invoice, order_item, "order", organization cascade',
    );
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
    for (const [id, orderStatus] of [
      ['paid', 'OrderProcessing'],
      ['problem', 'OrderProblem'],
    ]) {
      await client.query(
        `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, payment_date, order_status)
         values ($1, '{"name":"客人"}', 'dineIn', $1, 'Credit', $2, 100, now(), $3)`,
        [id, ORG, orderStatus],
      );
      await client.query(
        `insert into order_item (id, menu_item_id, menu_item_name, order_id, order_quantity, unit_price)
         values ($1, 'latte', '拿鐵', $2, 1, 100)`,
        [`${id}-1`, id],
      );
      await client.query(
        `insert into invoice (id, order_id, type, email, created_at, updated_at)
         values ($1, $1, 'personal', 'a@example.com', now() - interval '1 hour', now() - interval '1 hour')`,
        [id],
      );
    }
  });

  it('付款失敗轉異常的訂單即使有付款時間也不開立', async () => {
    await expect(service.issueForOrder('biru', 'problem')).rejects.toThrow(
      'common.invoices.notPaid',
    );
    expect(issueInvoice).not.toHaveBeenCalled();
  });

  it('重試只挑已付款訂單的待開發票', async () => {
    await service.retryPendingInvoices();

    expect(issueInvoice).toHaveBeenCalledTimes(1);
    expect(
      (
        await client.query(
          'select order_id from invoice where relate_number is not null',
        )
      ).rows,
    ).toEqual([{ order_id: 'paid' }]);
  });
});
