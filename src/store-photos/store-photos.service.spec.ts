import type { ConfigService } from '@nestjs/config';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { I18nContext } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import { storePhoto } from '../db/schema/store-photos.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { ImageStorageService } from '../images/image-storage.service.js';
import { withImageUrl } from '../images/image-url.js';

import { StorePhotosService } from './store-photos.service.js';

describe('StorePhotosService.findAll alt', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: StorePhotosService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new StorePhotosService(
      db as unknown as DrizzleDB,
      new ImageStorageService({
        get: () => undefined,
      } as unknown as ConfigService),
    );
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

  it('更新不存在的門市照片並帶新圖片時，先回 404，不上傳圖片', async () => {
    const store = vi.spyOn(ImageStorageService.prototype, 'store');

    await expect(
      service.update('missing', { image: 'data:image/jpeg;base64,/9j/4AAQ' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(store).not.toHaveBeenCalled();
  });
});

describe('StorePhotosService 圖片網址', () => {
  let client: PGlite;
  let service: StorePhotosService;
  const image = 'data:image/jpeg;base64,/9j/4AAQ';
  const r2Url = 'https://images.example.com/storePhoto/0123456789abcdef.jpg';

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new StorePhotosService(
      db as unknown as DrizzleDB,
      new ImageStorageService({
        get: () => undefined,
      } as unknown as ConfigService),
    );
    await client.exec('truncate store_photo');
    await db.insert(storePhoto).values([
      { id: 'bar', image, alt: { 'zh-TW': '吧台' }, sortOrder: 0 },
      { id: 'door', image: 'door.jpg', alt: { 'zh-TW': '門口' }, sortOrder: 1 },
      { id: 'counter', image: r2Url, alt: { 'zh-TW': '櫃台' }, sortOrder: 2 },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('前台與後台列表在資料庫組出和 withImageUrl 相同的網址', async () => {
    const expected = [
      withImageUrl('storePhoto', { id: 'bar', image }).imageUrl,
      null,
      r2Url,
    ];

    expect(
      (await service.findAllActive('zh-TW')).map(({ imageUrl }) => imageUrl),
    ).toEqual(expected);
    expect(
      (await service.findAll()).data.map(({ imageUrl }) => imageUrl),
    ).toEqual(expected);
  });

  it('分頁時每一頁的網址對應到自己的列', async () => {
    const page = async (offset: number) =>
      (await service.findAll({ limit: 1, offset })).data.map(
        ({ id, imageUrl }) => [id, imageUrl],
      );

    expect(await page(0)).toEqual([
      ['bar', withImageUrl('storePhoto', { id: 'bar', image }).imageUrl],
    ]);
    expect(await page(1)).toEqual([['door', null]]);
    expect(await page(2)).toEqual([['counter', r2Url]]);
  });
});
