import { readFileSync } from 'node:fs';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';

import { createPGlite } from '../../test/pglite.js';

const cleanup = readFileSync(
  './drizzle/0265_clear_supplier_on_sourced_ingredients.sql',
  'utf8',
);

describe('來源食譜食材清掉供應商', () => {
  let client: PGlite;

  beforeAll(async () => {
    client = createPGlite();
    await migrate(drizzle(client, { schema }), {
      migrationsFolder: './drizzle',
    });

    await client.exec(`
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address)
        values ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
      insert into supplier (id, name, organization_id) values ('supplier', '宇治', 'org');
      insert into recipe (id, name, organization_id) values ('syrup', '{"zh-TW":"糖漿"}', 'org');
      insert into ingredient (id, name, organization_id, unit_code, supplier_id, recipe_id) values
        ('sourced', '{"zh-TW":"自製糖漿"}', 'org', 'GRM', 'supplier', 'syrup'),
        ('purchased', '{"zh-TW":"抹茶粉"}', 'org', 'GRM', 'supplier', null);
    `);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('只清掉由來源食譜製成的食材的供應商', async () => {
    await client.exec(cleanup);

    const { rows } = await client.query(
      'select id, supplier_id from ingredient order by id',
    );
    expect(rows).toEqual([
      { id: 'purchased', supplier_id: 'supplier' },
      { id: 'sourced', supplier_id: null },
    ]);
  });
});
