import type { PGlite } from '@electric-sql/pglite';
import { asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import { ingredient } from '../db/schema/inventory.js';

import { netUnitPriceSql, unitPriceSql } from './pricing.js';

describe('netUnitPriceSql', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    await client.exec(`
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address)
        values ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
      insert into supplier (id, organization_id, name, uniform_invoice) values
        ('invoiced', 'org', '有發票', true),
        ('receipt', 'org', '收據', false);
      insert into recipe (id, organization_id, name, recipe_yield, recipe_yield_quantity, recipe_yield_unit_code)
        values ('sauce-recipe', 'org', '{"zh-TW":"醬"}', 1, 1000, 'GRM');
      insert into ingredient (id, organization_id, name, unit_code, price, eligible_quantity, eligible_quantity_unit_code, supplier_id, recipe_id, sort_order) values
        ('a-tomato', 'org', '{"zh-TW":"番茄"}', 'GRM', 1050, 1000, 'GRM', 'invoiced', null, 0),
        ('b-oil', 'org', '{"zh-TW":"油"}', 'MLT', 100, 1000, 'MLT', 'receipt', null, 1),
        ('c-salt', 'org', '{"zh-TW":"鹽"}', 'GRM', 20, 1000, 'GRM', null, null, 2),
        ('d-sauce', 'org', '{"zh-TW":"醬"}', 'GRM', null, null, null, null, 'sauce-recipe', 3);
      insert into recipe_ingredient (id, recipe_id, ingredient_id, required_quantity) values
        ('sauce-tomato', 'sauce-recipe', 'a-tomato', 500),
        ('sauce-oil', 'sauce-recipe', 'b-oil', 1000);
    `);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('takes the input tax out of invoiced purchases, also through homemade ingredients', async () => {
    const rows = await db
      .select({ gross: unitPriceSql, net: netUnitPriceSql })
      .from(ingredient)
      .orderBy(asc(ingredient.id));

    expect(rows.map(({ gross }) => gross)).toEqual([1.05, 0.1, 0.02, 0.625]);
    expect(rows.map(({ net }) => net)).toEqual([1, 0.1, 0.02, 0.6]);
  });
});
