import { PGlite } from '@electric-sql/pglite';
import { NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { imageVersion } from '../images/image-url.js';

import { UsersService } from './users.service.js';

vi.mock('../auth/deletion-guards.js', () => ({
  getDeletableUserIds: () => Promise.resolve(new Set<string>()),
}));

describe('UsersService.listUsers banned filter', () => {
  let client: PGlite;
  let service: UsersService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new UsersService(db as unknown as DrizzleDB);

    const day = 24 * 60 * 60 * 1000;
    await db.insert(schema.user).values([
      {
        id: 'active',
        name: 'Active',
        email: 'active@example.com',
        firstName: 'A',
      },
      {
        id: 'legacy',
        name: 'Legacy',
        email: 'legacy@example.com',
        firstName: 'A',
        banned: null,
      },
      {
        id: 'forever',
        name: 'Forever',
        email: 'forever@example.com',
        firstName: 'A',
        banned: true,
      },
      {
        id: 'expired',
        name: 'Expired',
        email: 'expired@example.com',
        firstName: 'A',
        banned: true,
        banExpires: new Date(Date.now() - day),
      },
      {
        id: 'until',
        name: 'Until',
        email: 'until@example.com',
        firstName: 'A',
        banned: true,
        banExpires: new Date(Date.now() + day),
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  const idsOf = async (query: Record<string, unknown>) =>
    (
      await service.listUsers({
        limit: 10,
        ...query,
      } as Parameters<UsersService['listUsers']>[0])
    ).data
      .map(({ id }) => id)
      .sort();

  it.each([
    ['is', 'true', ['forever', 'until']],
    ['is', 'false', ['active', 'expired', 'legacy']],
    ['not', 'true', ['active', 'expired', 'legacy']],
    ['not', 'false', ['forever', 'until']],
  ] as const)(
    '停權欄位 %s %s 把過期的停權算成使用中',
    async (filterOperator, filterValue, expected) => {
      expect(
        await idsOf({ filterField: 'banned', filterOperator, filterValue }),
      ).toEqual(expected);
    },
  );

  it.each([
    ['true', ['forever', 'until']],
    ['false', ['active', 'expired', 'legacy']],
  ] as const)('快速搜尋 banned:%s 與停權欄位一致', async (value, expected) => {
    expect(
      await idsOf({
        quickFilterEnums: [`banned:${value}`],
        quickFilterValue: 'zzz-no-text-match',
      }),
    ).toEqual(expected);
  });

  it('依停權排序時，過期的停權和使用中排在一起', async () => {
    const { data } = await service.listUsers({
      limit: 10,
      sortBy: 'banned',
      sortDirection: 'desc',
    } as Parameters<UsersService['listUsers']>[0]);

    expect(data.map(({ id }) => id)).toEqual([
      'forever',
      'until',
      'active',
      'expired',
      'legacy',
    ]);
  });

  it('同值排序以 id 決定順序，分頁不重複也不漏', async () => {
    const page = async (offset: number) =>
      (
        await service.listUsers({
          limit: 2,
          offset,
          sortBy: 'emailSubscribed',
          sortDirection: 'asc',
        } as Parameters<UsersService['listUsers']>[0])
      ).data.map(({ id }) => id);

    expect([
      ...(await page(0)),
      ...(await page(2)),
      ...(await page(4)),
    ]).toEqual(['active', 'expired', 'forever', 'legacy', 'until']);
  });
});

describe('UsersService 頭像', () => {
  let client: PGlite;
  let service: UsersService;
  const image = 'data:image/webp;base64,UklGRg==';
  const url = 'https://lh3.googleusercontent.com/a/avatar';

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new UsersService(db as unknown as DrizzleDB);

    await db.insert(schema.user).values([
      {
        id: 'data',
        name: 'Data',
        email: 'data@example.com',
        firstName: 'A',
        image,
      },
      {
        id: 'https',
        name: 'Https',
        email: 'https@example.com',
        firstName: 'A',
        image: url,
      },
      { id: 'none', name: 'None', email: 'none@example.com', firstName: 'A' },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('列表不回 image，改回頭像端點或原本的 https 網址', async () => {
    const { data } = await service.listUsers({
      limit: 10,
      sortBy: 'email',
      sortDirection: 'asc',
    } as Parameters<UsersService['listUsers']>[0]);

    expect(data).toEqual([
      expect.objectContaining({
        id: 'data',
        imageUrl: `/api/users/data/image/${imageVersion(image)}.webp`,
      }),
      expect.objectContaining({ id: 'https', imageUrl: url }),
      expect.objectContaining({ id: 'none', imageUrl: null }),
    ]);
    expect(Object.keys(data[0]).sort()).toEqual([
      'banExpires',
      'banReason',
      'banned',
      'bio',
      'createdAt',
      'deletable',
      'email',
      'emailSubscribed',
      'firstName',
      'hasSession',
      'id',
      'imageUrl',
      'lastName',
      'name',
      'role',
    ]);
  });

  it.each([
    [imageVersion(image), 'webp', true],
    ['0123456789abcdef', 'webp', false],
    [imageVersion(image), 'png', false],
  ])(
    '版本 %s、副檔名 %s 時回目前的頭像，current 為 %s',
    async (version, extension, current) => {
      expect(
        await service.findImage({ id: 'data', version, extension }),
      ).toEqual({
        current,
        mimeType: 'image/webp',
        data: Buffer.from('UklGRg==', 'base64'),
      });
    },
  );

  it.each(['https', 'none', 'missing'])(
    '%s 沒有存在資料庫的頭像時回 404',
    async (id) => {
      await expect(
        service.findImage({
          id,
          version: imageVersion(image),
          extension: 'webp',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );
});
