import { PGlite } from '@electric-sql/pglite';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import { platformDateString } from '../common/constants/timezone.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { OrderQrService } from '../orders/order-qr.service.js';

import { WaitlistService } from './waitlist.service.js';

describe('WaitlistService.createTicket number after midnight', () => {
  const today = platformDateString(new Date());
  const yesterday = platformDateString(
    new Date(Date.now() - 24 * 60 * 60 * 1000),
  );

  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: WaitlistService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
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
    await db.insert(schema.waitlistSetting).values({
      organizationId: 'store',
      enabled: true,
      groups: [
        { maxPartySize: 2, minPartySize: 1, prefix: 'A' },
        { maxPartySize: 4, minPartySize: 3, prefix: 'B' },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await db.delete(schema.waitlistTicket);
  });

  const takeTicket = (phoneNumber: string) =>
    service.createTicket(
      'biru',
      { name: '王小明', partySize: 2, phoneNumber },
      null,
      'zh-TW',
      null,
      true,
    );

  const seedYesterday = (
    number: number,
    status: 'waiting' | 'seated',
    prefix = 'A',
    endedAt: Date | null = null,
  ) =>
    db.insert(schema.waitlistTicket).values({
      id: `yesterday-${prefix}${number}`,
      organizationId: 'store',
      serviceDate: yesterday,
      prefix,
      number,
      partySize: 2,
      locale: 'zh-TW',
      status,
      endedAt,
    });

  it('continues after a ticket from yesterday that is still in the queue', async () => {
    await seedYesterday(12, 'waiting');
    await seedYesterday(20, 'seated');

    const ticket = await takeTicket('+886912345678');

    expect(ticket.ticketNumber).toBe('A013');
    expect(
      (
        await db.query.waitlistTicket.findFirst({
          where: (row, { eq }) => eq(row.id, ticket.id),
        })
      )?.serviceDate,
    ).toBe(today);
  });

  it('continues after a ticket from yesterday that ended today and is still on the board', async () => {
    await seedYesterday(7, 'seated', 'A', new Date());

    expect((await takeTicket('+886912345671')).ticketNumber).toBe('A008');
  });

  it('starts from 1 once yesterday’s queue ended before midnight', async () => {
    await seedYesterday(
      20,
      'seated',
      'A',
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );

    expect((await takeTicket('+886912345679')).ticketNumber).toBe('A001');
  });

  it('continues after yesterday’s queue when a ticket moves to another group', async () => {
    await seedYesterday(5, 'waiting', 'B');
    const ticket = await takeTicket('+886912345670');

    const moved = await service.updateTicket('biru', ticket.id, {
      name: '王小明',
      partySize: 3,
      phoneNumber: '+886912345670',
    });

    expect(moved.ticketNumber).toBe('B006');
  });
});
