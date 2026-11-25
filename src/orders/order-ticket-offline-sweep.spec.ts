import type { PGlite } from '@electric-sql/pglite';
import type { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';
import { ORDER_UPDATED_EVENT } from '../events/order-updated.event.js';

import * as schema from '../db/schema/index.js';
import { orderTicketJob, printer } from '../db/schema/printers.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import {
  PRINTER_OFFLINE_AFTER_MS,
  PrintersService,
} from '../printers/printers.service.js';

import { OrderTicketService } from './order-ticket.service.js';

describe('OrderTicketService 離線掃描（PGlite）', () => {
  const ORG = 'org-1';

  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let eventEmitter: EventEmitter2;
  let service: OrderTicketService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    eventEmitter = new EventEmitter2();
    service = new OrderTicketService(
      db as unknown as DrizzleDB,
      eventEmitter,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
      new PrintersService(
        db as unknown as DrizzleDB,
        {
          getOrThrow: () => 'http://api.test',
        } as unknown as ConfigService,
      ),
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      'truncate order_ticket_job, printer, "order", organization cascade',
    );
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
  });

  const jobsOf = (orderId: string) =>
    db
      .select({
        orderItemIds: orderTicketJob.orderItemIds,
        printerId: orderTicketJob.printerId,
        status: orderTicketJob.status,
      })
      .from(orderTicketJob)
      .where(eq(orderTicketJob.orderId, orderId))
      .orderBy(asc(orderTicketJob.createdAt), asc(orderTicketJob.id));

  const sendOrder = async ({ sentAt }: { sentAt: Date }) => {
    await service.createPrinter('biru', '吧台');
    await client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, order_status)
       values ('o1', '{"name":"王小明"}', 'counter', '1', 'Cash', $1, 100, 'OrderProcessing')`,
      [ORG],
    );
    await client.query(
      `insert into order_item (id, order_id, menu_item_id, menu_item_name, unit_price, order_quantity)
       values ('i1', 'o1', 'm1', '{}', 100, 1)`,
    );
    await db.transaction((tx) =>
      service.enqueueOrder(tx as unknown as DrizzleDB, 'o1', ORG),
    );
    await db.update(orderTicketJob).set({ sentAt, status: 'sent' });
    await db
      .update(printer)
      .set({ lastSeenAt: new Date(Date.now() - PRINTER_OFFLINE_AFTER_MS - 1) });
  };

  it('出單機離線超過門檻，送出後一直沒回報的工作轉成結果不明', async () => {
    await sendOrder({
      sentAt: new Date(Date.now() - PRINTER_OFFLINE_AFTER_MS - 1),
    });

    await service.markOfflineJobsUnknown();

    expect(await jobsOf('o1')).toEqual([
      expect.objectContaining({ status: 'unknown' }),
    ]);
  });

  it('離線的出單機在掃描途中回來取走的工作，不會被轉成結果不明', async () => {
    await sendOrder({ sentAt: new Date() });

    await service.markOfflineJobsUnknown();

    expect(await jobsOf('o1')).toEqual([
      expect.objectContaining({ status: 'sent' }),
    ]);
  });

  it('同一張訂單有多張工作轉成結果不明時，只推播一次訂單更新', async () => {
    await sendOrder({
      sentAt: new Date(Date.now() - PRINTER_OFFLINE_AFTER_MS - 1),
    });
    await client.exec(
      `create temp table job_copy as select * from order_ticket_job;
       update job_copy set id = 'job-copy';
       insert into order_ticket_job select * from job_copy;`,
    );
    const emitted: unknown[] = [];
    eventEmitter.on(ORDER_UPDATED_EVENT, (event) => emitted.push(event));

    await service.markOfflineJobsUnknown();

    expect(emitted).toEqual([{ orderId: 'o1', organizationId: ORG }]);
  });
});
