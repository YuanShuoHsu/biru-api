import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../../test/pglite.js';
import * as schema from '../../db/schema/index.js';
import { recipe } from '../../db/schema/inventory.js';
import { menu, menuItem, menuSection } from '../../db/schema/menus.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';

import { resolveAuditLabels } from './audit-resources.js';

const ORG = 'org';

describe('resolveAuditLabels recipe', () => {
  let client: PGlite;
  let db: DrizzleDB;

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as DrizzleDB;
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
    await pglite
      .insert(menu)
      .values({ id: 'menu', organizationId: ORG, name: { 'zh-TW': '菜單' } });
    await pglite.insert(menuSection).values({
      id: 'drinks',
      menuId: 'menu',
      name: { 'zh-TW': '飲品' },
      sortOrder: 0,
    });
    await pglite.insert(menuItem).values({
      id: 'latte',
      menuId: 'menu',
      menuSectionId: 'drinks',
      name: { 'zh-TW': '拿鐵' },
      sortOrder: 0,
    });
    await pglite.insert(recipe).values([
      {
        id: 'house-latte',
        menuItemId: 'latte',
        name: { 'zh-TW': '招牌拿鐵' },
        organizationId: ORG,
      },
      { id: 'draft', name: { 'zh-TW': '草稿' }, organizationId: ORG },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('nests a recipe under its menu item and section', async () => {
    const labels = await resolveAuditLabels(
      db,
      'recipe',
      new Map([
        ['house-latte', undefined],
        ['draft', undefined],
      ]),
    );

    expect(labels.get('house-latte')).toEqual({
      resourceLabel: { 'zh-TW': '招牌拿鐵' },
      ancestorIds: ['drinks', 'latte'],
    });
    expect(labels.get('draft')).toEqual({
      resourceLabel: { 'zh-TW': '草稿' },
      ancestorIds: [],
    });
  });

  it('uses the recipe row captured before a delete', async () => {
    const labels = await resolveAuditLabels(
      db,
      'recipe',
      new Map([
        [
          'gone',
          { id: 'gone', menuItemId: 'latte', name: { 'zh-TW': '已刪除' } },
        ],
      ]),
    );

    expect(labels.get('gone')).toEqual({
      resourceLabel: { 'zh-TW': '已刪除' },
      ancestorIds: ['drinks', 'latte'],
    });
  });
});
