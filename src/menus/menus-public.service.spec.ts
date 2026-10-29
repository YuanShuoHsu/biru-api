import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import { menu, menuItem, menuSection } from '../db/schema/menus.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { MenuItemSalesService } from '../orders/menu-item-sales.service.js';

import { PublicMenusService } from './menus-public.service.js';

const ORG = 'org';

describe('PublicMenusService.findOrderMenu', () => {
  let client: PGlite;
  let service: PublicMenusService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new PublicMenusService(
      db as unknown as DrizzleDB,
      {
        getSalesByMenuItemId: () => Promise.resolve(new Map()),
      } as unknown as MenuItemSalesService,
    );
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
    await db
      .insert(menu)
      .values({ id: 'menu', organizationId: ORG, name: { 'zh-TW': '菜單' } });
    await db.insert(menuSection).values([
      {
        id: 'drinks',
        menuId: 'menu',
        name: { 'zh-TW': '飲品' },
        sortOrder: 1,
      },
      {
        id: 'tea',
        menuId: 'menu',
        parentSectionId: 'drinks',
        name: { 'zh-TW': '茶' },
        sortOrder: 0,
      },
    ]);
    await db.insert(menuItem).values([
      {
        id: 'latte',
        menuId: 'menu',
        menuSectionId: 'drinks',
        name: { 'zh-TW': '拿鐵' },
        sortOrder: 0,
      },
      {
        id: 'oolong',
        menuId: 'menu',
        menuSectionId: 'tea',
        name: { 'zh-TW': '烏龍茶' },
        sortOrder: 0,
      },
    ]);
  });

  afterAll(async () => {
    await client.close();
  });

  it('lists sub-sections with their items in the menu-wide section order', async () => {
    const orderMenu = await service.findOrderMenu(ORG, 'zh-TW');

    expect(
      orderMenu?.sections.map(({ id, menuItems }) => [
        id,
        menuItems.map((item) => item.id),
      ]),
    ).toEqual([
      ['tea', ['oolong']],
      ['drinks', ['latte']],
    ]);
  });
});
