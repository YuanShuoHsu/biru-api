import { PGlite } from '@electric-sql/pglite';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { OrderQrService } from '../orders/order-qr.service.js';

import { WaitlistService } from './waitlist.service.js';

describe('WaitlistService.listTickets ticket number', () => {
  let client: PGlite;
  let service: WaitlistService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new WaitlistService(
      db as unknown as DrizzleDB,
      new EventEmitter2(),
      {} as OrderQrService,
    );

    await db.insert(schema.organization).values({
      id: 'store',
      name: 'Biru',
      slug: 'biru',
      createdAt: new Date(),
      addressCountry: 'TW',
      addressLocality: '中正區',
      addressRegion: '臺北市',
      postalCode: '100',
      streetAddress: '忠孝西路一段 1 號',
    });
    await db.insert(schema.waitlistTicket).values(
      [7, 1234].map((number) => ({
        id: `t${number}`,
        organizationId: 'store',
        serviceDate: '2026-11-10',
        prefix: 'A',
        number,
        partySize: 2,
        locale: 'zh-TW' as const,
      })),
    );
    await db.insert(schema.waitlistTicket).values(
      ['a', 'b', 'c', 'd', 'e'].map((id, index) => ({
        id,
        organizationId: 'store',
        serviceDate: '2026-11-09',
        prefix: 'B',
        number: index + 1,
        partySize: 4,
        locale: 'zh-TW' as const,
        createdAt: new Date('2026-11-09T00:00:00Z'),
      })),
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  const ticketNumbers = async (query: Record<string, unknown>) =>
    (await service.listTickets('biru', query)).data.map(
      ({ ticketNumber }) => ticketNumber,
    );

  it.each([
    ['A007', ['A007']],
    ['A1234', ['A1234']],
  ])('快速搜尋 %s 找得到畫面上的號碼', async (value, expected) => {
    expect(await ticketNumbers({ quickFilterValue: value })).toEqual(expected);
  });

  it('篩選號碼等於 A1234 時列出該號碼', async () => {
    expect(
      await ticketNumbers({
        filterField: 'ticketNumber',
        filterOperator: 'equals',
        filterValue: 'A1234',
      }),
    ).toEqual(['A1234']);
  });

  it('排序欄位與取號時間都相同時以 id 決定順序，分頁不重複也不漏', async () => {
    const page = async (offset: number) =>
      (
        await service.listTickets('biru', {
          filterField: 'partySize',
          filterOperator: '=',
          filterValue: '4',
          limit: 2,
          offset,
          sortBy: 'partySize',
          sortDirection: 'asc',
        })
      ).data.map(({ id }) => id);

    expect([
      ...(await page(0)),
      ...(await page(2)),
      ...(await page(4)),
    ]).toEqual(['e', 'd', 'c', 'b', 'a']);
  });
});
