import { PGlite } from '@electric-sql/pglite';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { PrintersService } from './printers.service.js';

describe('PrintersService.findOrganizationId（PGlite）', () => {
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
    await expect(lookup).rejects.toThrow('Organization not found');
  });
});
