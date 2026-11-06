import type { PGlite } from '@electric-sql/pglite';
import type { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';

import * as schema from '../db/schema/index.js';
import { printer as printerTable } from '../db/schema/printers.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { PrintersService } from '../printers/printers.service.js';

import { OrderTicketService } from './order-ticket.service.js';

describe('OrderTicketService 出單機（PGlite）', () => {
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
    await client.exec('truncate printer, organization cascade');
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
  });

  const printers = () =>
    db
      .select({ isDefault: printerTable.isDefault, name: printerTable.name })
      .from(printerTable)
      .where(eq(printerTable.organizationId, ORG))
      .orderBy(asc(printerTable.createdAt), asc(printerTable.id));

  it('同時新增多台時只有一台成為預設', async () => {
    await Promise.all(
      ['吧台', '廚房', '外帶'].map((name) =>
        service.createPrinter('biru', name),
      ),
    );

    const rows = await printers();
    expect(rows).toHaveLength(3);
    expect(rows.filter(({ isDefault }) => isDefault)).toHaveLength(1);
  });

  it('設為預設會取消原本的預設', async () => {
    await service.createPrinter('biru', '吧台');
    const kitchen = await service.createPrinter('biru', '廚房');

    await service.setDefaultPrinter('biru', kitchen.id);

    expect(await printers()).toEqual([
      { isDefault: false, name: '吧台' },
      { isDefault: true, name: '廚房' },
    ]);
  });

  it('移除預設的出單機和設為預設同時進行，仍只留一台預設', async () => {
    const bar = await service.createPrinter('biru', '吧台');
    await service.createPrinter('biru', '廚房');
    const takeout = await service.createPrinter('biru', '外帶');

    await Promise.all([
      service.deletePrinter('biru', bar.id),
      service.setDefaultPrinter('biru', takeout.id),
    ]);

    const rows = await printers();
    expect(rows.map(({ name }) => name)).toEqual(['廚房', '外帶']);
    expect(rows.filter(({ isDefault }) => isDefault)).toHaveLength(1);
  });
});
