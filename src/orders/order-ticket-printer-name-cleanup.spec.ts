import { readFileSync } from 'node:fs';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';

import { createPGlite } from '../../test/pglite.js';

const migration = readFileSync(
  './drizzle/0271_order_ticket_printer_name_unique.sql',
  'utf8',
);

describe('同店同名的工作單印表機改名後才建唯一索引', () => {
  let client: PGlite;

  const addPrinter = (
    id: string,
    organizationId: string,
    name: string,
    createdAt: string,
    purpose = 'orderTicket',
  ) =>
    client.query(
      `insert into printer (id, organization_id, purpose, name, username, digest_ha1, created_at)
       values ($1, $2, $3, $4, $1, 'ha1', $5)`,
      [id, organizationId, purpose, name, createdAt],
    );

  beforeAll(async () => {
    client = createPGlite();
    await migrate(drizzle(client, { schema }), {
      migrationsFolder: './drizzle',
    });
    await client.exec(
      'drop index "printer_organizationId_orderTicket_name_idx"',
    );

    await client.exec(`
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
        ('org-a', 'A', 'a', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
        ('org-b', 'B', 'b', now(), 'TW', '桃園市', '大園區', '中正東路一段');
    `);

    const long = 'x'.repeat(50);
    await addPrinter('bar-2', 'org-a', '吧台', '2026-01-02');
    await addPrinter('bar-1', 'org-a', '吧台', '2026-01-01');
    await addPrinter('bar-3b', 'org-a', '吧台', '2026-01-03');
    await addPrinter('bar-3a', 'org-a', '吧台', '2026-01-03');
    await addPrinter('bar-taken', 'org-a', '吧台 (2)', '2026-01-04');
    await addPrinter('long-1', 'org-a', long, '2026-01-01');
    await addPrinter('long-2', 'org-a', long, '2026-01-02');
    await addPrinter('other-store', 'org-b', '吧台', '2026-01-01');
    await addPrinter('invoice', 'org-b', '吧台', '2026-01-02', 'invoice');
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('最早建立的保留原名，其他依序加上沒被用過的編號', async () => {
    await client.exec(migration);

    const { rows } = await client.query(
      'select id, name from printer order by id',
    );
    expect(rows).toEqual([
      { id: 'bar-1', name: '吧台' },
      { id: 'bar-2', name: '吧台 (3)' },
      { id: 'bar-3a', name: '吧台 (4)' },
      { id: 'bar-3b', name: '吧台 (5)' },
      { id: 'bar-taken', name: '吧台 (2)' },
      { id: 'invoice', name: '吧台' },
      { id: 'long-1', name: 'x'.repeat(50) },
      { id: 'long-2', name: `${'x'.repeat(46)} (2)` },
      { id: 'other-store', name: '吧台' },
    ]);
  });
});
