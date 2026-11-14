import { PGlite } from '@electric-sql/pglite';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import {
  ADMIN_BOARD_COLUMN_LIMIT,
  ADMIN_BOARD_DONE_COLUMN_LIMIT,
} from '../common/constants/board.js';
import { platformDateString } from '../common/constants/timezone.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { OrderQrService } from '../orders/order-qr.service.js';

import { WaitlistService } from './waitlist.service.js';

describe('WaitlistService.listAdmin ended columns', () => {
  let client: PGlite;
  let service: WaitlistService;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T04:00:00Z'));
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

    const now = Date.now();
    const serviceDate = platformDateString(new Date());
    const ended = (status: 'cancelled' | 'seated', count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `${status}-${index}`,
        organizationId: 'store',
        serviceDate,
        prefix: status === 'seated' ? 'S' : 'C',
        number: index + 1,
        partySize: 2,
        locale: 'zh-TW' as const,
        status,
        createdAt: new Date(now - (count - index) * 2000),
        endedAt: new Date(now - (count - index) * 1000),
      }));
    await db
      .insert(schema.waitlistTicket)
      .values([
        ...ended('cancelled', ADMIN_BOARD_COLUMN_LIMIT + 1),
        ...ended('seated', ADMIN_BOARD_DONE_COLUMN_LIMIT + 1),
      ]);
  }, 60_000);

  afterAll(async () => {
    vi.useRealTimers();
    await client.close();
  });

  const idsOf = async (status: string) =>
    (await service.listAdmin('biru')).tickets
      .filter((ticket) => ticket.status === status)
      .map(({ id }) => id);

  it('結束的欄超過上限時保留最近結束的', async () => {
    const cancelled = await idsOf('cancelled');

    expect(cancelled).toHaveLength(ADMIN_BOARD_COLUMN_LIMIT);
    expect(cancelled).toContain(`cancelled-${ADMIN_BOARD_COLUMN_LIMIT}`);
    expect(cancelled).not.toContain('cancelled-0');
  });

  it('入座欄只取最近結束的 ADMIN_BOARD_DONE_COLUMN_LIMIT 筆', async () => {
    const seated = await idsOf('seated');

    expect(seated).toHaveLength(ADMIN_BOARD_DONE_COLUMN_LIMIT);
    expect(seated[0]).toBe(`seated-${ADMIN_BOARD_DONE_COLUMN_LIMIT}`);
    expect(seated).not.toContain('seated-0');
  });
});
