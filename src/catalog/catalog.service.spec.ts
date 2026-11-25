import type { ConfigService } from '@nestjs/config';

import { PGlite } from '@electric-sql/pglite';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import { catalogItem, catalogSection } from '../db/schema/catalog.js';
import * as schema from '../db/schema/index.js';
import { menu, menuSection } from '../db/schema/menus.js';
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
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'Biru', $2, now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
        [id, slug],
      );
    await db
      .insert(menu)
      .values({ id: 'menu', organizationId: ORG, name: name('菜單') });
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await db.delete(menuSection);
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

  it('sections 不回傳圖片本體', async () => {
    await db
      .update(catalogSection)
      .set({ image: 'data:image/png;base64,AAAA' })
      .where(eq(catalogSection.id, 'drinks'));

    const drinks = (await service.sections()).find(({ id }) => id === 'drinks');

    expect(drinks).not.toHaveProperty('image');
    expect(drinks?.imageRef).toMatch(/^image\/png [0-9a-f]{16}$/);
  });
});
