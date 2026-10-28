import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { I18nContext } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import { storePhoto } from '../db/schema/store-photos.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { StorePhotosService } from './store-photos.service.js';

describe('StorePhotosService.findAll alt', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: StorePhotosService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new StorePhotosService(db as unknown as DrizzleDB);
    await client.exec('truncate store_photo');
    await db.insert(storePhoto).values([
      {
        id: 'bar',
        image: 'bar.jpg',
        alt: { en: 'Coffee bar', 'zh-TW': '吧台' },
        sortOrder: 0,
      },
      {
        id: 'patio',
        image: 'patio.jpg',
        alt: { en: 'Patio', 'zh-TW': '中庭' },
        sortOrder: 1,
      },
      { id: 'door', image: 'door.jpg', alt: { 'zh-TW': '門口' }, sortOrder: 2 },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const photoIds = async (
    query: Parameters<StorePhotosService['findAll']>[0],
  ) => (await service.findAll(query)).data.map(({ id }) => id);

  it.each(['zh', 'TW', 'en', '"'])(
    '快速搜尋 %s 不會因為語系鍵或 JSON 符號命中',
    async (value) => {
      expect(await photoIds({ quickFilterValue: value })).toEqual([]);
    },
  );

  it('快速搜尋與篩選以替代文字命中', async () => {
    expect(await photoIds({ quickFilterValue: '中庭' })).toEqual(['patio']);
    expect(await photoIds({ quickFilterValue: 'bar' })).toEqual(['bar']);
    expect(
      await photoIds({
        filterField: 'alt',
        filterOperator: 'equals',
        filterValue: '門口',
      }),
    ).toEqual(['door']);
    expect(
      await photoIds({
        filterField: 'alt',
        filterOperator: 'doesNotEqual',
        filterValue: 'Patio',
      }),
    ).toEqual(['bar', 'door']);
  });

  it('依替代文字排序時取目前語系的文字', async () => {
    expect(await photoIds({ sortBy: 'alt', sortDirection: 'asc' })).toEqual([
      'patio',
      'bar',
      'door',
    ]);
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      lang: 'en',
    } as I18nContext);
    expect(await photoIds({ sortBy: 'alt', sortDirection: 'asc' })).toEqual([
      'bar',
      'patio',
      'door',
    ]);
  });
});
