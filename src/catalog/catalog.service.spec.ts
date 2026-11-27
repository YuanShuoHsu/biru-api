import type { ConfigService } from '@nestjs/config';

import { PGlite } from '@electric-sql/pglite';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import {
  catalogItem,
  catalogItemAddOn,
  catalogItemModifierGroup,
  catalogModifier,
  catalogModifierGroup,
  catalogSection,
} from '../db/schema/catalog.js';
import * as schema from '../db/schema/index.js';
import {
  menu,
  menuItem,
  menuSection,
  modifier,
  modifierGroup,
  offer,
} from '../db/schema/menus.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { ImageStorageService } from '../images/image-storage.service.js';

import { CatalogService } from './catalog.service.js';

const ORG = 'org';
const OTHER_ORG = 'other-org';

const name = (text: string) => ({ 'zh-TW': text });

describe('CatalogService', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: CatalogService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new CatalogService(
      db as unknown as DrizzleDB,
      new ImageStorageService({
        get: () => undefined,
      } as unknown as ConfigService),
    );
    for (const [id, slug] of [
      [ORG, 'biru'],
      [OTHER_ORG, 'other'],
    ])
      await client.query(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, $2, $2, now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
        [id, slug],
      );
    await db.insert(menu).values([
      { id: 'menu', organizationId: ORG, name: name('菜單') },
      { id: 'other-menu', organizationId: OTHER_ORG, name: name('菜單') },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await db.delete(menuSection);
    await db.delete(menuItem);
    await db.delete(catalogItem);
    await db.delete(catalogSection);
    await db.insert(catalogSection).values([
      { id: 'drinks', name: name('飲品'), sortOrder: 0 },
      {
        id: 'coffee',
        name: name('咖啡'),
        parentCatalogSectionId: 'drinks',
        sortOrder: 1,
      },
      {
        id: 'local',
        ownerOrganizationId: ORG,
        name: name('本店限定'),
        sortOrder: 0,
      },
      {
        id: 'other-local',
        ownerOrganizationId: OTHER_ORG,
        name: name('他店限定'),
        sortOrder: 0,
      },
    ]);
  });

  const errorCode = (promise: Promise<unknown>) =>
    promise.then(
      () => undefined,
      (error: { getResponse: () => { code: string } }) =>
        error.getResponse().code,
    );

  const parentOf = async (id: string) =>
    (
      await db
        .select({ parent: catalogSection.parentCatalogSectionId })
        .from(catalogSection)
        .where(eq(catalogSection.id, id))
    )[0]?.parent;

  describe('createSection', () => {
    it('建立品牌分類，排在品牌分類最前面，不動獨家分類的順序', async () => {
      const created = await service.createSection({
        name: name('甜點'),
        parentCatalogSectionId: 'drinks',
      });

      expect(created).toMatchObject({
        ownerOrganizationId: null,
        parentCatalogSectionId: 'drinks',
        sortOrder: 0,
      });
      const rows = await db
        .select({
          id: catalogSection.id,
          sortOrder: catalogSection.sortOrder,
        })
        .from(catalogSection)
        .orderBy(asc(catalogSection.id));
      expect(
        Object.fromEntries(rows.map((row) => [row.id, row.sortOrder])),
      ).toEqual({
        [created.id]: 0,
        coffee: 2,
        drinks: 1,
        local: 0,
        'other-local': 0,
      });
    });

    it('品牌分類的上層不能是獨家分類', async () => {
      expect(
        await errorCode(
          service.createSection({
            name: name('甜點'),
            parentCatalogSectionId: 'local',
          }),
        ),
      ).toBe('parentCatalogSectionOwnerMismatch');
    });

    it('上層分類不存在時回找不到', async () => {
      expect(
        await errorCode(
          service.createSection({
            name: name('甜點'),
            parentCatalogSectionId: 'missing',
          }),
        ),
      ).toBe('parentCatalogSectionNotFound');
    });
  });

  describe('updateSection', () => {
    it('獨家分類的上層可以是品牌分類或同門市的獨家分類', async () => {
      await service.updateSection('local', {
        parentCatalogSectionId: 'drinks',
      });
      expect(await parentOf('local')).toBe('drinks');

      await db.insert(catalogSection).values({
        id: 'local-child',
        ownerOrganizationId: ORG,
        name: name('本店子分類'),
      });
      await service.updateSection('local-child', {
        parentCatalogSectionId: 'local',
      });
      expect(await parentOf('local-child')).toBe('local');
    });

    it('獨家分類的上層不能是他店的獨家分類', async () => {
      expect(
        await errorCode(
          service.updateSection('local', {
            parentCatalogSectionId: 'other-local',
          }),
        ),
      ).toBe('parentCatalogSectionOwnerMismatch');
    });

    it('品牌分類的上層不能是獨家分類', async () => {
      expect(
        await errorCode(
          service.updateSection('coffee', { parentCatalogSectionId: 'local' }),
        ),
      ).toBe('parentCatalogSectionOwnerMismatch');
    });

    it('不能把自己或子孫設為上層', async () => {
      await db.insert(catalogSection).values({
        id: 'espresso',
        name: name('義式'),
        parentCatalogSectionId: 'coffee',
      });

      expect(
        await errorCode(
          service.updateSection('drinks', { parentCatalogSectionId: 'drinks' }),
        ),
      ).toBe('parentCatalogSectionSelf');
      expect(
        await errorCode(
          service.updateSection('drinks', {
            parentCatalogSectionId: 'espresso',
          }),
        ),
      ).toBe('parentCatalogSectionDescendant');
      expect(await parentOf('drinks')).toBeNull();
    });

    it('設為 null 移到最上層', async () => {
      await service.updateSection('coffee', { parentCatalogSectionId: null });

      expect(await parentOf('coffee')).toBeNull();
    });

    it('分類不存在時回找不到', async () => {
      expect(
        await errorCode(service.updateSection('missing', { name: name('x') })),
      ).toBe('catalogSectionNotFound');
    });
  });

  describe('deleteSection', () => {
    it('還有子分類時拒絕', async () => {
      expect(await errorCode(service.deleteSection('drinks'))).toBe(
        'catalogSectionHasSubsections',
      );
    });

    it('還有品項時拒絕', async () => {
      await db.insert(catalogItem).values({
        id: 'latte',
        catalogSectionId: 'coffee',
        name: name('拿鐵'),
      });

      expect(await errorCode(service.deleteSection('coffee'))).toBe(
        'catalogSectionHasItems',
      );
    });

    it('門市還有分類設定列時拒絕', async () => {
      await db.insert(menuSection).values({
        id: 'menu-coffee',
        menuId: 'menu',
        catalogSectionId: 'coffee',
        name: name('咖啡'),
      });

      expect(await errorCode(service.deleteSection('coffee'))).toBe(
        'catalogSectionInUse',
      );
    });

    it('沒有品項、子分類與門市設定時刪除並回傳該列', async () => {
      expect(await service.deleteSection('coffee')).toMatchObject({
        id: 'coffee',
      });
      expect(await parentOf('coffee')).toBeUndefined();
    });

    it('分類不存在時回找不到', async () => {
      expect(await errorCode(service.deleteSection('missing'))).toBe(
        'catalogSectionNotFound',
      );
    });
  });

  it('reorderSections 依傳入順序重排', async () => {
    await service.reorderSections(['coffee', 'drinks']);

    expect(
      (await service.sections())
        .filter(({ ownerOrganizationId }) => ownerOrganizationId === null)
        .map(({ id, sortOrder }) => [id, sortOrder]),
    ).toEqual([
      ['coffee', 0],
      ['drinks', 1],
    ]);
  });

  it('reorderSections 不動獨家分類，列表品牌分類在前', async () => {
    await service.reorderSections(['other-local', 'local', 'coffee', 'drinks']);

    expect(
      (await service.sections()).map(({ id, sortOrder }) => [id, sortOrder]),
    ).toEqual([
      ['coffee', 0],
      ['drinks', 1],
      ['local', 0],
      ['other-local', 0],
    ]);
  });

  it('sections 不回傳圖片本體', async () => {
    await db
      .update(catalogSection)
      .set({ image: 'data:image/png;base64,AAAA' })
      .where(eq(catalogSection.id, 'drinks'));

    const drinks = (await service.sections()).find(({ id }) => id === 'drinks');

    expect(drinks).not.toHaveProperty('image');
    expect(drinks?.imageRef).toMatch(/^image\/png [0-9a-f]{16}$/);
  });

  describe('catalog items', () => {
    beforeEach(async () => {
      await db.insert(catalogItem).values([
        {
          id: 'latte',
          catalogSectionId: 'coffee',
          name: name('拿鐵'),
          sortOrder: 0,
        },
        {
          id: 'mocha',
          catalogSectionId: 'coffee',
          name: name('摩卡'),
          sweetness: 'Fixed',
          fixedSweetnessLevel: 'HalfSugar',
          sortOrder: 1,
        },
        {
          id: 'tea',
          catalogSectionId: 'drinks',
          name: name('紅茶'),
          sortOrder: 0,
        },
      ]);
    });

    const sortOrdersOf = async (catalogSectionId: string) =>
      (await service.items(catalogSectionId)).map(({ id, sortOrder }) => [
        id,
        sortOrder,
      ]);

    describe('createItem', () => {
      it('建立品牌品項，排在該分類最前面，不動其他分類', async () => {
        const created = await service.createItem('coffee', {
          name: name('美式'),
          suggestedPrice: '90.00',
        });

        expect(created).toMatchObject({
          ownerOrganizationId: null,
          catalogSectionId: 'coffee',
          suggestedPrice: '90.00',
          sweetness: 'NotApplicable',
          servingTemperatures: [],
          discontinued: false,
          sortOrder: 0,
        });
        expect(await sortOrdersOf('coffee')).toEqual([
          [created.id, 0],
          ['latte', 1],
          ['mocha', 2],
        ]);
        expect(await sortOrdersOf('drinks')).toEqual([['tea', 0]]);
      });

      it('推薦溫度不屬於可供應的冷熱時存 null，甜度不可調時不存推薦甜度', async () => {
        const created = await service.createItem('coffee', {
          name: name('美式'),
          servingTemperatures: ['Hot'],
          recommendedServingTemperatureLevel: 'LessIce',
          recommendedSweetnessLevel: 'NoSugar',
        });

        expect(created).toMatchObject({
          recommendedServingTemperatureLevel: null,
          recommendedSweetnessLevel: null,
        });
      });

      it('品牌品項不能放在獨家分類', async () => {
        expect(
          await errorCode(service.createItem('local', { name: name('美式') })),
        ).toBe('catalogItemSectionOwnerMismatch');
      });

      it('分類不存在時回找不到', async () => {
        expect(
          await errorCode(
            service.createItem('missing', { name: name('美式') }),
          ),
        ).toBe('catalogSectionNotFound');
      });

      it('甜度固定卻沒有固定甜度時拒絕', async () => {
        expect(
          await errorCode(
            service.createItem('coffee', {
              name: name('美式'),
              sweetness: 'Fixed',
            }),
          ),
        ).toBe('fixedSweetnessLevelRequired');
      });

      it('促銷結束日早於開始日時拒絕', async () => {
        expect(
          await errorCode(
            service.createItem('coffee', {
              name: name('美式'),
              priceSpecification: {
                price: '80.00',
                validFrom: '2026-12-31',
                validThrough: '2026-12-01',
              },
            }),
          ),
        ).toBe('promoDateRangeInvalid');
      });
    });

    describe('items', () => {
      it('依排序列出分類的品項，不回傳圖片本體', async () => {
        await db
          .update(catalogItem)
          .set({ image: 'data:image/png;base64,AAAA' })
          .where(eq(catalogItem.id, 'latte'));

        const items = await service.items('coffee');

        expect(items.map(({ id }) => id)).toEqual(['latte', 'mocha']);
        expect(items[0]).not.toHaveProperty('image');
        expect(items[0].imageRef).toMatch(/^image\/png [0-9a-f]{16}$/);
      });

      it('分類不存在時回找不到', async () => {
        expect(await errorCode(service.items('missing'))).toBe(
          'catalogSectionNotFound',
        );
      });
    });

    describe('updateItem', () => {
      it('甜度改為可調時清掉固定甜度', async () => {
        expect(
          await service.updateItem('mocha', {
            sweetness: 'Adjustable',
            recommendedSweetnessLevel: 'LessSugar',
          }),
        ).toMatchObject({
          sweetness: 'Adjustable',
          fixedSweetnessLevel: null,
          recommendedSweetnessLevel: 'LessSugar',
        });
      });

      it('只改其他欄位時保留現有甜度設定', async () => {
        expect(
          await service.updateItem('mocha', {
            discontinued: true,
            suggestedPrice: null,
          }),
        ).toMatchObject({
          discontinued: true,
          suggestedPrice: null,
          sweetness: 'Fixed',
          fixedSweetnessLevel: 'HalfSugar',
        });
      });

      it('品項不存在時回找不到', async () => {
        expect(
          await errorCode(service.updateItem('missing', { name: name('x') })),
        ).toBe('catalogItemNotFound');
      });
    });

    it('reorderItems 只重排該分類的品項', async () => {
      await service.reorderItems('coffee', ['mocha', 'latte', 'tea']);

      expect(await sortOrdersOf('coffee')).toEqual([
        ['mocha', 0],
        ['latte', 1],
      ]);
      expect(await sortOrdersOf('drinks')).toEqual([['tea', 0]]);
    });

    it('item 品項不存在時回找不到', async () => {
      expect(await errorCode(service.item('missing'))).toBe(
        'catalogItemNotFound',
      );
    });

    describe('deleteItem', () => {
      it('還有門市上架列時拒絕並列出門市，已下架的上架列也算', async () => {
        await db.insert(menuItem).values([
          {
            id: 'biru-latte',
            menuId: 'menu',
            catalogItemId: 'latte',
            name: name('拿鐵'),
          },
          {
            id: 'other-latte',
            menuId: 'other-menu',
            catalogItemId: 'latte',
            name: name('拿鐵'),
          },
        ]);
        await db.insert(offer).values({
          id: 'other-latte-offer',
          menuItemId: 'other-latte',
          price: '120.00',
          availability: 'Discontinued',
        });

        const error = await service.deleteItem('latte').then(
          () => undefined,
          (error: { getResponse: () => Record<string, unknown> }) =>
            error.getResponse(),
        );

        expect(error).toMatchObject({
          code: 'catalogItemListed',
          organizations: [
            { id: ORG, name: 'biru' },
            { id: OTHER_ORG, name: 'other' },
          ],
        });
        expect(await service.item('latte')).toMatchObject({ id: 'latte' });
      });

      it('沒有上架列時刪除，連同以它為加購目標的加購', async () => {
        await db.insert(catalogItemAddOn).values({
          id: 'mocha-latte',
          catalogItemId: 'mocha',
          addOnCatalogItemId: 'latte',
        });

        expect(await service.deleteItem('latte')).toMatchObject({
          id: 'latte',
        });
        expect(await errorCode(service.item('latte'))).toBe(
          'catalogItemNotFound',
        );
        expect(await db.select().from(catalogItemAddOn)).toEqual([]);
      });

      it('品項不存在時回找不到', async () => {
        expect(await errorCode(service.deleteItem('missing'))).toBe(
          'catalogItemNotFound',
        );
      });
    });
  });

  describe('catalog modifier groups', () => {
    beforeEach(async () => {
      await db.delete(modifierGroup);
      await db.delete(catalogModifierGroup);
      await db.insert(catalogModifierGroup).values([
        {
          id: 'sugar',
          displayName: name('甜度'),
          minSelectionCount: 1,
          maxSelectionCount: 1,
          sortOrder: 0,
        },
        { id: 'toppings', displayName: name('加料'), sortOrder: 1 },
        {
          id: 'local-group',
          ownerOrganizationId: ORG,
          displayName: name('本店加料'),
          sortOrder: 0,
        },
      ]);
      await db.insert(catalogModifier).values([
        {
          id: 'half',
          catalogModifierGroupId: 'sugar',
          displayName: name('半糖'),
          sortOrder: 0,
        },
        {
          id: 'none',
          catalogModifierGroupId: 'sugar',
          displayName: name('無糖'),
          sortOrder: 1,
        },
        {
          id: 'pearl',
          catalogModifierGroupId: 'toppings',
          displayName: name('珍珠'),
          priceAdjustment: '10.00',
          sortOrder: 0,
        },
      ]);
    });

    const groupSortOrders = async () =>
      (await service.modifierGroups()).map(({ id, sortOrder }) => [
        id,
        sortOrder,
      ]);

    const modifierSortOrders = async (catalogModifierGroupId: string) =>
      (await service.modifiers(catalogModifierGroupId)).map(
        ({ id, sortOrder }) => [id, sortOrder],
      );

    const overrideModifier = async (
      catalogModifierId: string,
      menuId: string,
    ) => {
      await db
        .insert(modifierGroup)
        .values({ id: `${menuId}-group`, menuId, displayName: name('甜度') })
        .onConflictDoNothing();
      await db.insert(modifier).values({
        id: `${menuId}-${catalogModifierId}`,
        modifierGroupId: `${menuId}-group`,
        menuId,
        catalogModifierId,
        displayName: name('選項'),
      });
    };

    const errorResponse = (promise: Promise<unknown>) =>
      promise.then(
        () => undefined,
        (error: { getResponse: () => Record<string, unknown> }) =>
          error.getResponse(),
      );

    describe('createModifierGroup', () => {
      it('建立品牌群組，排在品牌群組最前面，不動獨家群組', async () => {
        const created = await service.createModifierGroup({
          displayName: name('冰塊'),
          minSelectionCount: 1,
          maxSelectionCount: 1,
        });

        expect(created).toMatchObject({
          ownerOrganizationId: null,
          minSelectionCount: 1,
          maxSelectionCount: 1,
          sortOrder: 0,
        });
        expect(await groupSortOrders()).toEqual([
          [created.id, 0],
          ['sugar', 1],
          ['toppings', 2],
          ['local-group', 0],
        ]);
      });

      it('最多選擇數量少於最少選擇數量時拒絕', async () => {
        expect(
          await errorCode(
            service.createModifierGroup({
              displayName: name('冰塊'),
              minSelectionCount: 2,
              maxSelectionCount: 1,
            }),
          ),
        ).toBe('selectionCountInvalid');
      });
    });

    describe('updateModifierGroup', () => {
      it('只改最多選擇數量時以現有的最少選擇數量檢查', async () => {
        await db
          .update(catalogModifierGroup)
          .set({ minSelectionCount: 2, maxSelectionCount: null })
          .where(eq(catalogModifierGroup.id, 'toppings'));

        expect(
          await errorCode(
            service.updateModifierGroup('toppings', { maxSelectionCount: 1 }),
          ),
        ).toBe('selectionCountInvalid');
        expect(
          await service.updateModifierGroup('toppings', {
            maxSelectionCount: 3,
          }),
        ).toMatchObject({ minSelectionCount: 2, maxSelectionCount: 3 });
      });

      it('最多選擇數量可設為 null（不限）', async () => {
        expect(
          await service.updateModifierGroup('sugar', {
            maxSelectionCount: null,
          }),
        ).toMatchObject({ minSelectionCount: 1, maxSelectionCount: null });
      });

      it('群組不存在時回找不到', async () => {
        expect(
          await errorCode(
            service.updateModifierGroup('missing', { displayName: name('x') }),
          ),
        ).toBe('catalogModifierGroupNotFound');
      });
    });

    it('reorderModifierGroups 只重排品牌群組', async () => {
      await service.reorderModifierGroups(['local-group', 'toppings', 'sugar']);

      expect(await groupSortOrders()).toEqual([
        ['toppings', 0],
        ['sugar', 1],
        ['local-group', 0],
      ]);
    });

    it('modifierGroup 群組不存在時回找不到', async () => {
      expect(await errorCode(service.modifierGroup('missing'))).toBe(
        'catalogModifierGroupNotFound',
      );
    });

    describe('deleteModifierGroup', () => {
      it('還有品項連結時拒絕並列出品項', async () => {
        await db.insert(catalogItem).values({
          id: 'latte',
          catalogSectionId: 'coffee',
          name: name('拿鐵'),
        });
        await db.insert(catalogItemModifierGroup).values({
          id: 'latte-sugar',
          catalogItemId: 'latte',
          catalogModifierGroupId: 'sugar',
        });

        expect(
          await errorResponse(service.deleteModifierGroup('sugar')),
        ).toMatchObject({
          code: 'catalogModifierGroupLinked',
          catalogItems: [{ id: 'latte', name: '拿鐵' }],
        });
        expect(await service.modifierGroup('sugar')).toMatchObject({
          id: 'sugar',
        });
      });

      it('底下選項還有門市覆寫列時拒絕並列出門市', async () => {
        await overrideModifier('half', 'menu');
        await overrideModifier('none', 'other-menu');

        expect(
          await errorResponse(service.deleteModifierGroup('sugar')),
        ).toMatchObject({
          code: 'catalogModifierGroupInUse',
          organizations: [
            { id: ORG, name: 'biru' },
            { id: OTHER_ORG, name: 'other' },
          ],
        });
        expect(await modifierSortOrders('sugar')).toHaveLength(2);
      });

      it('沒有連結與覆寫列時連同底下選項刪除', async () => {
        await overrideModifier('pearl', 'menu');

        expect(await service.deleteModifierGroup('sugar')).toMatchObject({
          id: 'sugar',
        });
        expect(
          (await db.select().from(catalogModifier)).map(({ id }) => id),
        ).toEqual(['pearl']);
      });

      it('群組不存在時回找不到', async () => {
        expect(await errorCode(service.deleteModifierGroup('missing'))).toBe(
          'catalogModifierGroupNotFound',
        );
      });
    });

    describe('createModifier', () => {
      it('建立選項，排在群組最前面，不動其他群組', async () => {
        const created = await service.createModifier('sugar', {
          displayName: name('全糖'),
          priceAdjustment: '5.00',
        });

        expect(created).toMatchObject({
          catalogModifierGroupId: 'sugar',
          priceAdjustment: '5.00',
          sortOrder: 0,
        });
        expect(await modifierSortOrders('sugar')).toEqual([
          [created.id, 0],
          ['half', 1],
          ['none', 2],
        ]);
        expect(await modifierSortOrders('toppings')).toEqual([['pearl', 0]]);
      });

      it('群組不存在時回找不到', async () => {
        expect(
          await errorCode(
            service.createModifier('missing', { displayName: name('全糖') }),
          ),
        ).toBe('catalogModifierGroupNotFound');
      });
    });

    describe('modifiers', () => {
      it('依排序列出群組的選項，不回傳圖片本體', async () => {
        await db
          .update(catalogModifier)
          .set({ image: 'data:image/png;base64,AAAA' })
          .where(eq(catalogModifier.id, 'half'));

        const modifiers = await service.modifiers('sugar');

        expect(modifiers.map(({ id }) => id)).toEqual(['half', 'none']);
        expect(modifiers[0]).not.toHaveProperty('image');
        expect(modifiers[0].imageRef).toMatch(/^image\/png [0-9a-f]{16}$/);
      });

      it('群組不存在時回找不到', async () => {
        expect(await errorCode(service.modifiers('missing'))).toBe(
          'catalogModifierGroupNotFound',
        );
      });
    });

    describe('updateModifier', () => {
      it('更新名稱與建議加價', async () => {
        expect(
          await service.updateModifier('pearl', {
            displayName: name('黑糖珍珠'),
            priceAdjustment: null,
          }),
        ).toMatchObject({
          displayName: name('黑糖珍珠'),
          priceAdjustment: null,
        });
      });

      it('選項不存在時回找不到', async () => {
        expect(
          await errorCode(
            service.updateModifier('missing', { displayName: name('x') }),
          ),
        ).toBe('catalogModifierNotFound');
      });
    });

    it('reorderModifiers 只重排該群組的選項', async () => {
      await service.reorderModifiers('sugar', ['none', 'half', 'pearl']);

      expect(await modifierSortOrders('sugar')).toEqual([
        ['none', 0],
        ['half', 1],
      ]);
      expect(await modifierSortOrders('toppings')).toEqual([['pearl', 0]]);
    });

    it('modifier 選項不存在時回找不到', async () => {
      expect(await errorCode(service.modifier('missing'))).toBe(
        'catalogModifierNotFound',
      );
    });

    describe('deleteModifier', () => {
      it('還有門市覆寫列時拒絕並列出門市', async () => {
        await overrideModifier('half', 'menu');

        expect(
          await errorResponse(service.deleteModifier('half')),
        ).toMatchObject({
          code: 'catalogModifierInUse',
          organizations: [{ id: ORG, name: 'biru' }],
        });
        expect(await service.modifier('half')).toMatchObject({ id: 'half' });
      });

      it('沒有覆寫列時刪除並回傳該列', async () => {
        await overrideModifier('none', 'menu');

        expect(await service.deleteModifier('half')).toMatchObject({
          id: 'half',
        });
        expect(await modifierSortOrders('sugar')).toEqual([['none', 1]]);
      });

      it('選項不存在時回找不到', async () => {
        expect(await errorCode(service.deleteModifier('missing'))).toBe(
          'catalogModifierNotFound',
        );
      });
    });
  });
});
