import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import {
  menu,
  menuItem,
  menuItemAddOn,
  menuItemModifierGroup,
  menuSection,
  modifier,
  modifierGroup,
} from '../db/schema/menus.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { withImageUrl } from '../images/image-url.js';
import type { MenuItemSalesService } from '../orders/menu-item-sales.service.js';

import { PublicMenusService } from './menus-public.service.js';

const ORG = 'org';

const MENU_IMAGE = 'data:image/png;base64,iVBORw0KGgo=';
const SECTION_IMAGE = 'data:image/jpeg;base64,/9j/4AAQ';
const LATTE_IMAGE = 'data:image/webp;base64,UklGRg==';
const OOLONG_IMAGE = 'data:image/bmp;base64,Qk0=';
const BOBA_IMAGE = 'data:image/png;base64,Qm9iYQ==';

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
    await db.insert(menu).values({
      id: 'menu',
      organizationId: ORG,
      name: { 'zh-TW': '菜單' },
      image: MENU_IMAGE,
    });
    await db.insert(menuSection).values([
      {
        id: 'drinks',
        menuId: 'menu',
        name: { 'zh-TW': '飲品' },
        image: SECTION_IMAGE,
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
        image: LATTE_IMAGE,
        sortOrder: 0,
      },
      {
        id: 'oolong',
        menuId: 'menu',
        menuSectionId: 'tea',
        name: { 'zh-TW': '烏龍茶' },
        image: OOLONG_IMAGE,
        sortOrder: 0,
      },
    ]);
    await db.insert(menuItemAddOn).values([
      { id: 'latte-tea', menuItemId: 'latte', addOnMenuItemId: 'oolong' },
      { id: 'oolong-latte', menuItemId: 'oolong', addOnMenuItemId: 'latte' },
      {
        id: 'oolong-drinks',
        menuItemId: 'oolong',
        addOnMenuSectionId: 'drinks',
        sortOrder: 1,
      },
    ]);
    await db.insert(modifierGroup).values({
      id: 'extras',
      menuId: 'menu',
      displayName: { 'zh-TW': '加料' },
    });
    await db.insert(menuItemModifierGroup).values({
      id: 'latte-extras',
      menuItemId: 'latte',
      modifierGroupId: 'extras',
    });
    await db.insert(modifier).values([
      {
        id: 'boba',
        modifierGroupId: 'extras',
        displayName: { 'zh-TW': '珍珠' },
        image: BOBA_IMAGE,
        sortOrder: 0,
      },
      {
        id: 'jelly',
        modifierGroupId: 'extras',
        displayName: { 'zh-TW': '仙草' },
        sortOrder: 1,
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

  it('builds the same image urls as hashing the image in node, without loading it', async () => {
    const orderMenu = await service.findOrderMenu(ORG, 'zh-TW');
    const sections = new Map(orderMenu?.sections.map((s) => [s.id, s]));
    const latte = sections.get('drinks')?.menuItems[0];
    const oolong = sections.get('tea')?.menuItems[0];

    expect(orderMenu?.imageUrl).toBe(
      withImageUrl('menu', { id: 'menu', image: MENU_IMAGE }).imageUrl,
    );
    expect(sections.get('drinks')?.imageUrl).toBe(
      withImageUrl('menuSection', { id: 'drinks', image: SECTION_IMAGE })
        .imageUrl,
    );
    expect(latte?.imageUrl).toBe(
      withImageUrl('menuItem', { id: 'latte', image: LATTE_IMAGE }).imageUrl,
    );
    expect(oolong?.imageUrl).toBeNull();
    expect(sections.get('tea')?.imageUrl).toBeNull();
    expect(oolong?.addOns[0].menuItems[0].imageUrl).toBe(latte?.imageUrl);
    expect(oolong?.addOns[1].menuItems.map(({ imageUrl }) => imageUrl)).toEqual(
      [latte?.imageUrl],
    );
    expect(latte?.addOns[0].menuItems[0].imageUrl).toBeNull();
    expect(latte).not.toHaveProperty('image');
    expect(latte).not.toHaveProperty('imageRef');
  });

  it('returns modifier image urls instead of the image, also under add-on items', async () => {
    const orderMenu = await service.findOrderMenu(ORG, 'zh-TW');
    const sections = new Map(orderMenu?.sections.map((s) => [s.id, s]));
    const [boba, jelly] =
      sections.get('drinks')?.menuItems[0].modifierGroups[0].modifiers ?? [];

    expect(boba.imageUrl).toBe(
      withImageUrl('modifier', { id: 'boba', image: BOBA_IMAGE }).imageUrl,
    );
    expect(jelly.imageUrl).toBeNull();
    expect(boba).not.toHaveProperty('image');
    expect(boba).not.toHaveProperty('imageRef');
    expect(
      sections.get('tea')?.menuItems[0].addOns[0].menuItems[0].modifierGroups[0]
        .modifiers[0].imageUrl,
    ).toBe(boba.imageUrl);
  });
});
