import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { I18nService } from 'nestjs-i18n';

import * as schema from '../db/schema/index.js';
import { banner } from '../db/schema/banners.js';
import { deletedRecord } from '../db/schema/deleted-records.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { DeletedRecordsService } from './deleted-records.service.js';

describe('DeletedRecordsService.restore', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: DeletedRecordsService;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new DeletedRecordsService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { emit: vi.fn() } as unknown as EventEmitter2,
      {} as I18nService,
      {} as never,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('還原 commit 後才失敗的異動紀錄不會讓請求失敗', async () => {
    await db.insert(banner).values({ id: 'b1', image: 'banner' });
    await db.delete(banner);
    const [{ batchId }] = await db.select().from(deletedRecord);
    vi.spyOn(
      service as unknown as { resolveOrganizationId: () => Promise<never> },
      'resolveOrganizationId',
    ).mockRejectedValue(new Error('lookup failed'));

    await expect(
      service.restore([batchId], {
        id: 'admin',
        name: 'admin',
        email: 'admin@example.com',
      }),
    ).resolves.toBeUndefined();
    expect(await db.select({ id: banner.id }).from(banner)).toEqual([
      { id: 'b1' },
    ]);
  });
});

describe('DeletedRecordsService.list', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: DeletedRecordsService;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new DeletedRecordsService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as EventEmitter2,
      {} as I18nService,
      {} as never,
    );
    await db.insert(deletedRecord).values([
      {
        batchId: 1,
        tableName: 'menu_item',
        recordId: 'i1',
        data: { name: { 'zh-TW': '拿鐵', en: 'Latte' } },
        deletedAt: new Date('2026-10-01T02:00:00Z'),
      },
      {
        batchId: 2,
        tableName: 'supplier',
        recordId: 's1',
        data: { name: '北區豆商', organization_id: 'org1' },
        deletedAt: new Date('2026-10-01T17:00:00Z'),
      },
      {
        batchId: 3,
        tableName: 'supplier',
        recordId: 's2',
        data: { name: '南區豆商', organization_id: 'org2' },
        deletedAt: new Date('2026-10-03T02:00:00Z'),
      },
      {
        batchId: 4,
        tableName: 'organization',
        recordId: 'org3',
        data: { name: '信義門市', slug: 'xinyi' },
        deletedAt: new Date('2026-09-30T02:00:00Z'),
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  const ids = (result: { data: { batchId: number }[] }) =>
    result.data.map(({ batchId }) => batchId);

  it('快速搜尋比對多語名稱', async () => {
    const result = await service.list({ quickFilterValue: '拿鐵' });

    expect(ids(result)).toEqual([1]);
    expect(result.total).toBe(1);
  });

  it('依資料類型篩選並依刪除時間排序', async () => {
    const result = await service.list({
      filterField: 'tableName',
      filterOperator: 'is',
      filterValue: 'supplier',
      sortBy: 'deletedAt',
      sortDirection: 'asc',
    });

    expect(ids(result)).toEqual([2, 3]);
    expect(result.total).toBe(2);
  });

  it('依台北日期篩選刪除時間', async () => {
    const result = await service.list({
      filterField: 'deletedAt',
      filterOperator: 'is',
      filterValue: '2026-10-02',
    });

    expect(ids(result)).toEqual([2]);
  });

  it('依組織名稱篩選時涵蓋被刪除的門市本身', async () => {
    const result = await service.list({
      filterField: 'organizationName',
      filterOperator: 'contains',
      filterValue: '信義',
    });

    expect(result.data).toMatchObject([
      { batchId: 4, organizationName: '信義門市' },
    ]);
  });

  it('店家視角的篩選只在本店資料內生效', async () => {
    const result = await service.list(
      {
        filterField: 'tableName',
        filterOperator: 'is',
        filterValue: 'supplier',
      },
      { organizationId: 'org1', role: 'owner', closed: false },
    );

    expect(ids(result)).toEqual([2]);
    expect(result.total).toBe(1);
  });
});
