import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

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
