import type { PGlite } from '@electric-sql/pglite';
import type { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';

import * as schema from '../db/schema/index.js';
import { orderTicketJob } from '../db/schema/printers.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { PrintersService } from '../printers/printers.service.js';

import { OrderTicketService } from './order-ticket.service.js';

describe('OrderTicketService 移除出單機（PGlite）', () => {
  const ORG = 'org-1';

  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: OrderTicketService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new OrderTicketService(
      db as unknown as DrizzleDB,
      new EventEmitter2(),
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

  it('排隊中的正本改排到剩下的出單機，舊工作單取消並不再指向已移除的那台', async () => {
    const bar = await service.createPrinter('biru', '吧台');
    const kitchen = await service.createPrinter('biru', '廚房');
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

    await service.deletePrinter('biru', bar.id);

    expect(await jobsOf('o1')).toEqual([
      { orderItemIds: ['i1'], printerId: null, status: 'cancelled' },
      { orderItemIds: ['i1'], printerId: kitchen.id, status: 'queued' },
    ]);
  });
});
