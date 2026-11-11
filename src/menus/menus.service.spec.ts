import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { I18nContext } from 'nestjs-i18n';

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
  offer,
} from '../db/schema/menus.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { ImageStorageService } from '../images/image-storage.service.js';
import { withImageRefUrl, withImageUrl } from '../images/image-url.js';
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
      new ImageStorageService({
        get: () => undefined,
      } as unknown as ConfigService),
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

    it('排序值相同時，依 id 排出固定順序，分頁不重複也不漏', async () => {
      const pages = [];
      for (const offset of [0, 1, 2])
        pages.push(
          ...(await itemIds({ limit: 1, offset, sortBy: 'createdAt' })),
        );
      expect(pages).toEqual(['americano', 'latte', 'mocha']);
    });

    it('同一品項的 offer 建立時間相同時，列表、單筆與價格排序都取 id 較小的那筆', async () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      await db.insert(offer).values([
        { id: 'offer-b', menuItemId: 'mocha', price: '80', createdAt },
        { id: 'offer-a', menuItemId: 'mocha', price: '60', createdAt },
        { id: 'latte-offer', menuItemId: 'latte', price: '70', createdAt },
      ]);
      try {
        const { data } = await service.menuSectionItems('drinks', ORG, {});
        expect(data.find(({ id }) => id === 'mocha')?.offer?.id).toBe(
          'offer-a',
        );
        expect((await service.menuItem({ id: 'mocha' }, ORG))?.offer?.id).toBe(
          'offer-a',
        );
        expect(
          (await service.menuItemOffers('mocha', ORG)).map(({ id }) => id),
        ).toEqual(['offer-a', 'offer-b']);
        expect(
          await itemIds({ sortBy: 'price', sortDirection: 'asc' }),
        ).toEqual(['mocha', 'latte', 'americano']);
      } finally {
        await client.exec(`delete from offer`);
      }
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

    it('同一個選項群組不能重複掛載到同一個品項，排序也不變', async () => {
      const sortOrders = () =>
        db
          .select({
            id: menuItemModifierGroup.id,
            sortOrder: menuItemModifierGroup.sortOrder,
          })
          .from(menuItemModifierGroup)
          .orderBy(menuItemModifierGroup.id);
      const before = await sortOrders();

      await expect(
        service.createMenuItemModifierGroup('latte', {
          modifierGroupId: 'extras',
        } as CreateMenuItemModifierGroupDto),
      ).rejects.toMatchObject({
        response: { code: 'modifierGroupAttached' },
        status: 409,
      });
      expect(await sortOrders()).toEqual(before);
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

    it('取得單一選項時帶門市幣別，不存在時回帶代碼的 404', async () => {
      await expect(
        service.modifier({ id: 'boba' }, ORG),
      ).resolves.toMatchObject({
        id: 'boba',
        modifierGroupId: 'extras',
        priceCurrency: 'TWD',
      });
      await expect(
        service.modifier({ id: 'missing' }, ORG),
      ).rejects.toMatchObject({
        response: { code: 'modifierNotFound' },
        status: 404,
      });
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

    it.each([
      { id: 'missing', menuItemId: 'latte' },
      { id: 'with-americano', menuItemId: 'americano' },
    ])('加購不存在或不屬於該品項時，更新與刪除都回 404：%j', async (where) => {
      await expect(
        service.updateMenuItemAddOn(where, { addOnMenuItemId: 'americano' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.deleteMenuItemAddOn(where)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
  describe('加購對象', () => {
    const rejected = {
      response: { code: 'addOnTargetRequired' },
      status: 400,
    };

    it.each([
      {},
      { addOnMenuItemId: null, addOnMenuSectionId: null },
      { addOnMenuItemId: 'americano', addOnMenuSectionId: 'toppings' },
    ])('建立時要剛好指定一個品項或分類：%j', async (data) => {
      await expect(
        service.createMenuItemAddOn('latte', data as never),
      ).rejects.toMatchObject(rejected);
    });

    it('更新時把唯一的對象清掉會擋下，另指定一個品項才通過', async () => {
      const where = { id: 'with-toppings', menuItemId: 'latte' };

      await expect(
        service.updateMenuItemAddOn(where, { addOnMenuSectionId: null }),
      ).rejects.toMatchObject(rejected);
      await expect(
        service.updateMenuItemAddOn(where, { addOnMenuItemId: 'americano' }),
      ).rejects.toMatchObject(rejected);
      await expect(
        service.updateMenuItemAddOn(where, {
          addOnMenuItemId: 'americano',
          addOnMenuSectionId: null,
        }),
      ).resolves.toMatchObject({
        addOnMenuItemId: 'americano',
        addOnMenuSectionId: null,
      });
    });
  });
});

describe('MenusService 列表的圖片網址', () => {
  let client: PGlite;
  let service: MenusService;
  let imageStorage: ImageStorageService;
  const MENU_IMAGE = 'data:image/png;base64,iVBORw0KGgo=';
  const SECTION_IMAGE = 'data:image/jpeg;base64,/9j/4AAQ';
  const ITEM_IMAGE = 'data:image/webp;base64,UklGRg==';
  const MODIFIER_IMAGE = 'data:image/png;base64,Qm9iYQ==';

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    imageStorage = new ImageStorageService({
      get: () => undefined,
    } as unknown as ConfigService);
    service = new MenusService(
      db as unknown as DrizzleDB,
      {
        costsOf: () => Promise.resolve(new Map()),
      } as unknown as RecipesService,
      imageStorage,
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
    await db.insert(menuSection).values({
      id: 'drinks',
      menuId: 'menu',
      name: { 'zh-TW': '飲品' },
      image: SECTION_IMAGE,
    });
    await db.insert(menuItem).values([
      {
        id: 'latte',
        menuId: 'menu',
        menuSectionId: 'drinks',
        name: { 'zh-TW': '拿鐵' },
        image: ITEM_IMAGE,
        sortOrder: 0,
      },
      {
        id: 'mocha',
        menuId: 'menu',
        menuSectionId: 'drinks',
        name: { 'zh-TW': '摩卡' },
        sortOrder: 1,
      },
    ]);
    await db.insert(modifierGroup).values({
      id: 'extras',
      menuId: 'menu',
      displayName: { 'zh-TW': '加料' },
    });
    await db.insert(modifier).values({
      id: 'boba',
      modifierGroupId: 'extras',
      displayName: { 'zh-TW': '珍珠' },
      image: MODIFIER_IMAGE,
    });
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('選項列表不載入圖片，網址和 withImageUrl 相同', async () => {
    const { data } = await service.modifiers('extras', ORG);

    expect(data[0]).not.toHaveProperty('image');
    expect(withImageRefUrl('modifier', data[0]).imageUrl).toBe(
      withImageUrl('modifier', { id: 'boba', image: MODIFIER_IMAGE }).imageUrl,
    );
  });

  it('新增與更新選項的圖片經過 modifier 的圖片儲存，沒送圖片時保留原圖', async () => {
    const store = vi.spyOn(imageStorage, 'store');

    const created = await service.createModifier('extras', ORG, {
      displayName: { 'zh-TW': '椰果' },
      image: ITEM_IMAGE,
    });
    expect(store).toHaveBeenCalledWith('modifier', ITEM_IMAGE);
    expect(created.image).toBe(ITEM_IMAGE);

    const renamed = await service.updateModifier({
      where: { id: created.id },
      organizationId: ORG,
      data: { displayName: { 'zh-TW': '大椰果' } },
    });
    expect(store).toHaveBeenLastCalledWith('modifier', undefined);
    expect(renamed.image).toBe(ITEM_IMAGE);

    const cleared = await service.updateModifier({
      where: { id: created.id },
      organizationId: ORG,
      data: { image: null },
    });
    expect(store).toHaveBeenLastCalledWith('modifier', null);
    expect(cleared.image).toBeNull();
  });

  it('菜單、分類與品項列表不載入圖片，網址和 withImageUrl 相同', async () => {
    const [menuRow] = await service.menus(ORG);
    const { data: sections } = await service.menuSections('menu');
    const { data: items } = await service.menuSectionItems('drinks', ORG);

    expect(menuRow).not.toHaveProperty('image');
    expect(withImageRefUrl('menu', menuRow).imageUrl).toBe(
      withImageUrl('menu', { id: 'menu', image: MENU_IMAGE }).imageUrl,
    );
    expect(withImageRefUrl('menuSection', sections[0]).imageUrl).toBe(
      withImageUrl('menuSection', { id: 'drinks', image: SECTION_IMAGE })
        .imageUrl,
    );
    expect(
      items.map((item) => withImageRefUrl('menuItem', item).imageUrl),
    ).toEqual([
      withImageUrl('menuItem', { id: 'latte', image: ITEM_IMAGE }).imageUrl,
      null,
    ]);
  });
});
