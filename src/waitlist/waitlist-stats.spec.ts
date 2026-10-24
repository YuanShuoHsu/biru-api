import { EventEmitter2 } from '@nestjs/event-emitter';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { WaitlistService } from './waitlist.service.js';

describe('WaitlistService.getStats', () => {
  let client: PGlite;
  let service: WaitlistService;

  beforeAll(async () => {
    client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new WaitlistService(
      db as unknown as DrizzleDB,
      new EventEmitter2(),
    );
    await client.query(
      `insert into organization (id, name, slug, created_at) values ('org', 'Biru', 'biru', now())`,
    );
    for (const [number, status, createdAt] of [
      [1, 'seated', '2026-10-22T15:59:00Z'],
      [2, 'seated', '2026-10-22T16:00:00Z'],
      [3, 'noShow', '2026-10-23T15:59:00Z'],
      [4, 'seated', '2026-10-23T16:00:00Z'],
    ])
      await client.query(
        `insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale, status, created_at)
         values ($1, 'org', '2026-10-23', 'A', $2, 2, 'zh-TW', $3, $4)`,
        [`t${number}`, number, status, createdAt],
      );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('帶 until 時只統計 since 起、until 前的取號', async () => {
    const stats = await service.getStats(
      'biru',
      new Date('2026-10-22T16:00:00Z'),
      new Date('2026-10-23T16:00:00Z'),
    );

    expect(stats).toEqual(
      expect.objectContaining({ noShow: 1, seated: 1, total: 2 }),
    );
    expect(stats.hourlyTickets[0]).toBe(1);
    expect(stats.hourlyTickets[23]).toBe(1);
  });

  it('不帶 until 時統計到現在', async () => {
    const stats = await service.getStats(
      'biru',
      new Date('2026-10-22T16:00:00Z'),
    );

    expect(stats.total).toBe(3);
  });
});
