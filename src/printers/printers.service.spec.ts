import { PGlite } from '@electric-sql/pglite';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { PrintersService } from './printers.service.js';

describe('PrintersService（PGlite）', () => {
  let client: PGlite;
  let service: PrintersService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org-1', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
    );
    service = new PrintersService(
      db as unknown as DrizzleDB,
      { getOrThrow: () => 'http://api.test' } as unknown as ConfigService,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('以 slug 找到門市 id', async () => {
    await expect(service.findOrganizationId('biru')).resolves.toBe('org-1');
  });

  it('找不到門市時回 404', async () => {
    const lookup = service.findOrganizationId('missing');

    await expect(lookup).rejects.toBeInstanceOf(NotFoundException);
    await expect(lookup).rejects.toThrow('organizationNotFound');
  });

  it('建立時間相同的出單機依 id 排出固定順序', async () => {
    await client.exec(
      `insert into printer (id, organization_id, purpose, username, digest_ha1, created_at) values ('c', 'org-1', 'orderTicket', 'tie-c', 'x', '2026-01-01'), ('a', 'org-1', 'orderTicket', 'tie-a', 'x', '2026-01-01'), ('b', 'org-1', 'orderTicket', 'tie-b', 'x', '2026-01-01')`,
    );

    const printers = await service.list('org-1', 'orderTicket');

    expect(printers.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  it('nc 超過 int4 範圍時拒絕而不是丟出 500', async () => {
    const [printer] = await drizzle(client, { schema })
      .insert(schema.printer)
      .values({
        id: 'printer-1',
        organizationId: 'org-1',
        purpose: 'orderTicket',
        username: 'biru-nc-overflow',
        digestHa1: 'ha1',
      })
      .returning();
    const nonce = `${Date.now()}.salt.signature`;

    await expect(
      service.acceptNonceCount(printer, nonce, 0x80000000),
    ).resolves.toBe(false);
    await expect(
      service.acceptNonceCount(printer, nonce, 0x7fffffff),
    ).resolves.toBe(true);
  });

  it('只列出沒連過或超過輪詢間隔加 60 秒沒來的出單機', async () => {
    const secondsAgo = (seconds: number) =>
      new Date(Date.now() - seconds * 1000).toISOString();
    await client.query(
      `insert into printer (id, organization_id, purpose, username, digest_ha1, last_seen_at, poll_gaps_ms) values
        ('off-never', 'org-1', 'orderTicket', 'offline-never', 'x', null, null),
        ('off-recent', 'org-1', 'orderTicket', 'offline-recent', 'x', $1, null),
        ('off-stale', 'org-1', 'orderTicket', 'offline-stale', 'x', $2, null),
        ('off-slow', 'org-1', 'orderTicket', 'offline-slow', 'x', $2, '{30000}'),
        ('off-invoice', 'org-1', 'invoice', 'offline-invoice', 'x', null, null)`,
      [secondsAgo(10), secondsAgo(70)],
    );

    const offline = await service.listOffline('orderTicket');

    expect(
      offline
        .map(({ id }) => id)
        .filter((id) => id.startsWith('off-'))
        .toSorted(),
    ).toEqual(['off-never', 'off-stale']);
  });
});
