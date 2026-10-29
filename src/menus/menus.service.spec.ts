import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { I18nContext, type I18nService } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import { recipe } from '../db/schema/inventory.js';
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
import type { I18nTranslations } from '../generated/i18n.generated.js';
import type { RecipesService } from '../inventory/recipes.service.js';

import type { CreateMenuItemModifierGroupDto } from './dto/create-menu-item-modifier-group.dto.js';
import { MenusService } from './menus.service.js';

const ORG = 'org';

const DRINKS = [
  { id: 'latte', name: { en: 'Latte', 'zh-TW': '拿鐵' } },
  { id: 'americano', name: { en: 'Americano', 'zh-TW': '美式' } },
  { id: 'mocha', name: { 'zh-TW': '摩卡' } },
];

describe('MenusService localized text filters and sorting', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: MenusService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new MenusService(
      db as unknown as DrizzleDB,
      {
        costsOf: () => Promise.resolve(new Map()),
      } as unknown as RecipesService,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
    );
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
    await db
      .insert(menu)
      .values({ id: 'menu', organizationId: ORG, name: { 'zh-TW': '菜單' } });
    await db.insert(menuSection).values([
      ...DRINKS.map((row, index) => ({
        ...row,
        menuId: 'menu',
        sortOrder: index,
        description:
          row.id === 'latte'
            ? { en: 'Espresso with milk', 'zh-TW': '義式加牛奶' }
            : null,
      })),
      {
        id: 'drinks',
        menuId: 'menu',
        name: { en: 'Drinks', 'zh-TW': '飲品' },
        sortOrder: 3,
      },
      {
        id: 'toppings',
        menuId: 'menu',
        name: { en: 'Toppings', 'zh-TW': '配料' },
        sortOrder: 4,
      },
    ]);
    await db.insert(menuItem).values(
      DRINKS.map((row, index) => ({
        ...row,
        menuId: 'menu',
        menuSectionId: 'drinks',
        sortOrder: index,
      })),
    );
    await db.insert(recipe).values([
      {
        id: 'house-latte',
        name: { en: 'House Latte', 'zh-TW': '招牌拿鐵' },
        organizationId: ORG,
        menuItemId: 'latte',
      },
      {
        id: 'black-coffee',
        name: { en: 'Black Coffee', 'zh-TW': '黑咖啡' },
        organizationId: ORG,
        menuItemId: 'americano',
      },
    ]);
    await db.insert(menuItemAddOn).values([
      {
        id: 'with-americano',
        menuItemId: 'latte',
        addOnMenuItemId: 'americano',
        sortOrder: 0,
      },
      {
        id: 'with-toppings',
        menuItemId: 'latte',
        addOnMenuSectionId: 'toppings',
        sortOrder: 1,
      },
    ]);
    await db.insert(modifierGroup).values([
      {
        id: 'ice',
        menuId: 'menu',
        displayName: { en: 'Ice level', 'zh-TW': '冰量' },
        sortOrder: 0,
      },
      {
        id: 'extras',
        menuId: 'menu',
        displayName: { en: 'Add-ons', 'zh-TW': '加料' },
        sortOrder: 1,
      },
    ]);
    await db.insert(menuItemModifierGroup).values([
      { id: 'latte-ice', menuItemId: 'latte', modifierGroupId: 'ice' },
      { id: 'latte-extras', menuItemId: 'latte', modifierGroupId: 'extras' },
    ]);
    await db.insert(modifier).values([
      {
        id: 'boba',
        modifierGroupId: 'extras',
        displayName: { en: 'Boba', 'zh-TW': '珍珠' },
        sortOrder: 0,
      },
      {
        id: 'jelly',
        modifierGroupId: 'extras',
        displayName: { en: 'Grass jelly', 'zh-TW': '仙草' },
        sortOrder: 1,
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const inEnglish = () =>
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      lang: 'en',
    } as I18nContext);

  describe('menuSections', () => {
    const sectionIds = async (
      query: Parameters<MenusService['menuSections']>[1],
    ) =>
      (await service.menuSections('menu', query)).data
        .map(({ id }) => id)
        .filter((id) => DRINKS.some((drink) => drink.id === id));

    it.each(['zh', 'TW', 'en', '"'])(
      '快速搜尋 %s 不會因為語系鍵或 JSON 符號命中',
      async (value) => {
        expect(await sectionIds({ quickFilterValue: value })).toEqual([]);
      },
    );

    it('快速搜尋與篩選以名稱、描述的文字命中', async () => {
      expect(await sectionIds({ quickFilterValue: '拿鐵' })).toEqual(['latte']);
      expect(await sectionIds({ quickFilterValue: 'mer' })).toEqual([
        'americano',
      ]);
      expect(await sectionIds({ quickFilterValue: '牛奶' })).toEqual(['latte']);
      expect(
        await sectionIds({
          filterField: 'name',
          filterOperator: 'equals',
          filterValue: 'Latte',
        }),
      ).toEqual(['latte']);
      expect(
        await sectionIds({
          filterField: 'name',
          filterOperator: 'isAnyOf',
          filterValue: 'Americano,摩卡',
        }),
      ).toEqual(['americano', 'mocha']);
      expect(
        await sectionIds({
          filterField: 'description',
          filterOperator: 'doesNotContain',
          filterValue: 'zh',
        }),
      ).toEqual(['latte', 'americano', 'mocha']);
      expect(
        await sectionIds({
          filterField: 'description',
          filterOperator: 'isNotEmpty',
        }),
      ).toEqual(['latte']);
      expect(
        await sectionIds({
          searchField: 'name',
          searchOperator: 'startsWith',
          searchValue: 'ame',
        }),
      ).toEqual(['americano']);
    });

    it('依名稱排序時取目前語系的名稱', async () => {
      expect(
        await sectionIds({ sortBy: 'name', sortDirection: 'asc' }),
      ).toEqual(['latte', 'mocha', 'americano']);
      inEnglish();
      expect(
        await sectionIds({ sortBy: 'name', sortDirection: 'asc' }),
      ).toEqual(['americano', 'latte', 'mocha']);
    });
  });

  describe('menuSectionItems', () => {
    const itemIds = async (
      query: Parameters<MenusService['menuSectionItems']>[2],
    ) =>
      (await service.menuSectionItems('drinks', ORG, query)).data.map(
        ({ id }) => id,
      );

    it.each(['zh', 'TW', '"'])(
      '快速搜尋 %s 不會因為語系鍵或 JSON 符號命中',
      async (value) => {
        expect(await itemIds({ quickFilterValue: value })).toEqual([]);
      },
    );

    it('快速搜尋與篩選以品項與食譜名稱的文字命中', async () => {
      expect(await itemIds({ quickFilterValue: '美式' })).toEqual([
        'americano',
      ]);
      expect(await itemIds({ quickFilterValue: '招牌' })).toEqual(['latte']);
      expect(
        await itemIds({
          filterField: 'name',
          filterOperator: 'equals',
          filterValue: '摩卡',
        }),
      ).toEqual(['mocha']);
      expect(
        await itemIds({
          filterField: 'recipe',
          filterOperator: 'equals',
          filterValue: 'House Latte',
        }),
      ).toEqual(['latte']);
      expect(
        await itemIds({
          filterField: 'recipe',
          filterOperator: 'contains',
          filterValue: 'en',
        }),
      ).toEqual([]);
      expect(
        await itemIds({
          filterField: 'recipe',
          filterOperator: 'isEmpty',
        }),
      ).toEqual(['mocha']);
      expect(
        await itemIds({
          filterField: 'recipe',
          filterOperator: 'doesNotContain',
          filterValue: 'Latte',
        }),
      ).toEqual(['americano', 'mocha']);
      expect(
        await itemIds({
          searchField: 'name',
          searchOperator: 'endsWith',
          searchValue: 'tte',
        }),
      ).toEqual(['latte']);
    });

    it('依名稱排序時取目前語系的名稱', async () => {
      expect(await itemIds({ sortBy: 'name', sortDirection: 'asc' })).toEqual([
        'latte',
        'mocha',
        'americano',
      ]);
      inEnglish();
      expect(await itemIds({ sortBy: 'name', sortDirection: 'asc' })).toEqual([
        'americano',
        'latte',
        'mocha',
      ]);
    });

    it('依食譜名稱排序時取目前語系的名稱，沒有食譜的品項在降冪時排最前', async () => {
      expect(await itemIds({ sortBy: 'recipe', sortDirection: 'asc' })).toEqual(
        ['latte', 'americano', 'mocha'],
      );
      expect(
        await itemIds({ sortBy: 'recipe', sortDirection: 'desc' }),
      ).toEqual(['mocha', 'americano', 'latte']);
      inEnglish();
      expect(await itemIds({ sortBy: 'recipe', sortDirection: 'asc' })).toEqual(
        ['americano', 'latte', 'mocha'],
      );
      expect(
        await itemIds({ sortBy: 'recipe', sortDirection: 'desc' }),
      ).toEqual(['mocha', 'latte', 'americano']);
    });
  });

  describe('menuItemAddOns', () => {
    const addOnIds = async (
      query: Parameters<MenusService['menuItemAddOns']>[1],
    ) =>
      (await service.menuItemAddOns('latte', query)).data.map(({ id }) => id);

    it.each(['zh', 'TW', '"'])(
      '快速搜尋 %s 不會因為語系鍵或 JSON 符號命中',
      async (value) => {
        expect(await addOnIds({ quickFilterValue: value })).toEqual([]);
      },
    );

    it('分類名稱先取加購分類，沒有時取加購品項所屬分類', async () => {
      expect(await addOnIds({ quickFilterValue: '配料' })).toEqual([
        'with-toppings',
      ]);
      expect(
        await addOnIds({
          filterField: 'addOnMenuSectionName',
          filterOperator: 'equals',
          filterValue: 'Drinks',
        }),
      ).toEqual(['with-americano']);
      expect(
        await addOnIds({
          filterField: 'addOnMenuItemName',
          filterOperator: 'equals',
          filterValue: '美式',
        }),
      ).toEqual(['with-americano']);
      expect(
        await addOnIds({
          filterField: 'addOnMenuItemName',
          filterOperator: 'isEmpty',
        }),
      ).toEqual(['with-toppings']);
      expect(
        await addOnIds({
          filterField: 'addOnMenuItemName',
          filterOperator: 'doesNotContain',
          filterValue: 'Americano',
        }),
      ).toEqual(['with-toppings']);
    });

    it('依分類名稱排序時取目前語系的名稱', async () => {
      expect(
        await addOnIds({
          sortBy: 'addOnMenuSectionName',
          sortDirection: 'asc',
        }),
      ).toEqual(['with-toppings', 'with-americano']);
      inEnglish();
      expect(
        await addOnIds({
          sortBy: 'addOnMenuSectionName',
          sortDirection: 'asc',
        }),
      ).toEqual(['with-americano', 'with-toppings']);
    });
  });

  describe('modifier groups', () => {
    const groupIds = async (
      query: Parameters<MenusService['modifierGroups']>[1],
    ) => (await service.modifierGroups('menu', query)).data.map(({ id }) => id);

    const itemGroupIds = async (
      query: Parameters<MenusService['menuItemModifierGroups']>[1],
    ) =>
      (await service.menuItemModifierGroups('latte', query)).data.map(
        ({ modifierGroupId }) => modifierGroupId,
      );

    it('快速搜尋與篩選以顯示名稱的文字命中', async () => {
      expect(await groupIds({ quickFilterValue: 'zh' })).toEqual([]);
      expect(await groupIds({ quickFilterValue: '冰' })).toEqual(['ice']);
      expect(
        await groupIds({
          filterField: 'displayName',
          filterOperator: 'equals',
          filterValue: 'Add-ons',
        }),
      ).toEqual(['extras']);
      expect(await itemGroupIds({ quickFilterValue: '"' })).toEqual([]);
      expect(
        await itemGroupIds({
          filterField: 'displayName',
          filterOperator: 'equals',
          filterValue: '冰量',
        }),
      ).toEqual(['ice']);
    });

    it('依顯示名稱排序時取目前語系的名稱', async () => {
      const sorted = { sortBy: 'displayName', sortDirection: 'asc' } as const;
      expect(await groupIds(sorted)).toEqual(['ice', 'extras']);
      expect(await itemGroupIds(sorted)).toEqual(['ice', 'extras']);
      inEnglish();
      expect(await groupIds(sorted)).toEqual(['extras', 'ice']);
      expect(await itemGroupIds(sorted)).toEqual(['extras', 'ice']);
    });
  });

  describe('modifiers', () => {
    const modifierIds = async (
      query: Parameters<MenusService['modifiers']>[2],
    ) =>
      (await service.modifiers('extras', ORG, query)).data.map(({ id }) => id);

    it('快速搜尋與篩選以顯示名稱的文字命中', async () => {
      expect(await modifierIds({ quickFilterValue: 'en' })).toEqual([]);
      expect(await modifierIds({ quickFilterValue: '珍珠' })).toEqual(['boba']);
      expect(
        await modifierIds({
          filterField: 'displayName',
          filterOperator: 'equals',
          filterValue: 'Grass jelly',
        }),
      ).toEqual(['jelly']);
    });

    it('依顯示名稱排序時取目前語系的名稱', async () => {
      const sorted = { sortBy: 'displayName', sortDirection: 'asc' } as const;
      expect(await modifierIds(sorted)).toEqual(['jelly', 'boba']);
      inEnglish();
      expect(await modifierIds(sorted)).toEqual(['boba', 'jelly']);
    });
  });

  describe('missing records', () => {
    const inTranslation = () =>
      vi.spyOn(I18nContext, 'current').mockReturnValue({
        t: (key: string) => `translated:${key}`,
      } as unknown as I18nContext);

    it('品項不存在時回 404，帶代碼與翻譯後的訊息', async () => {
      inTranslation();

      await expect(
        service.createMenuItemModifierGroup('missing', {
          modifierGroupId: 'extras',
        } as CreateMenuItemModifierGroupDto),
      ).rejects.toMatchObject({
        response: {
          code: 'menuItemNotFound',
          message: 'translated:common.menus.menuItemNotFound',
        },
        status: 404,
      });
    });

    it('選項群組不在品項的菜單時回 404，帶代碼與翻譯後的訊息', async () => {
      inTranslation();

      await expect(
        service.createMenuItemModifierGroup('latte', {
          modifierGroupId: 'missing',
        } as CreateMenuItemModifierGroupDto),
      ).rejects.toMatchObject({
        response: {
          code: 'modifierGroupNotFound',
          message: 'translated:common.menus.modifierGroupNotFound',
        },
        status: 404,
      });
    });
  });
});
