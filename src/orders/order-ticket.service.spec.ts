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

  it('一次新增多台時只有一台成為預設', async () => {
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

  it('移除預設的出單機並改設另一台為預設後，仍恰好一台是預設', async () => {
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

  it('同店已有同名的出單機時拒絕新增', async () => {
    await service.createPrinter('biru', '吧台');

    await expect(service.createPrinter('biru', '吧台')).rejects.toMatchObject({
      response: { code: 'printerNameTaken' },
      status: 409,
    });
    expect(await printers()).toHaveLength(1);
  });

  it('不同店可以用同一個名稱', async () => {
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org-2', 'Biru 2', 'biru-2', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
    );
    await service.createPrinter('biru', '吧台');

    await expect(
      service.createPrinter('biru-2', '吧台'),
    ).resolves.toMatchObject({ name: '吧台' });
  });

  it('改名', async () => {
    const bar = await service.createPrinter('biru', '吧台');

    await expect(
      service.renamePrinter('biru', bar.id, '手搖吧台'),
    ).resolves.toMatchObject({ id: bar.id, isDefault: true, name: '手搖吧台' });
    expect(await printers()).toEqual([{ isDefault: true, name: '手搖吧台' }]);
  });

  it('改成同店另一台的名稱時拒絕', async () => {
    const bar = await service.createPrinter('biru', '吧台');
    await service.createPrinter('biru', '廚房');

    await expect(
      service.renamePrinter('biru', bar.id, '廚房'),
    ).rejects.toMatchObject({
      response: { code: 'printerNameTaken' },
      status: 409,
    });
    expect((await printers()).map(({ name }) => name)).toEqual([
      '吧台',
      '廚房',
    ]);
  });

  it('改名不存在或別店的出單機時回 404', async () => {
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org-2', 'Biru 2', 'biru-2', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
    );
    const elsewhere = await service.createPrinter('biru-2', '吧台');

    for (const printerId of [elsewhere.id, 'missing'])
      await expect(
        service.renamePrinter('biru', printerId, '廚房'),
      ).rejects.toMatchObject({
        response: { code: 'printerNotFound' },
        status: 404,
      });
  });
});
