import { NotFoundException } from '@nestjs/common';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { imageVersion } from './image-url.js';
import { ImagesService } from './images.service.js';

describe('ImagesService', () => {
  let client: PGlite;
  let service: ImagesService;
  let version: string;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new ImagesService(db as unknown as DrizzleDB);

    const image = 'data:image/png;base64,iVBORw0KGgo=';
    await db.insert(schema.banner).values({ id: 'banner-1', image });
    await db
      .insert(schema.banner)
      .values({ id: 'banner-2', image: 'not-a-data-url' });
    await db.insert(schema.banner).values({
      id: 'banner-3',
      image: 'https://images.example.com/banner/0123456789abcdef.png',
    });
    version = imageVersion(image);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('回傳解碼後的圖片、MIME 類型，並標示網址就是目前的版本', async () => {
    const { current, mimeType, data } = await service.find({
      kind: 'banner',
      id: 'banner-1',
      version,
      extension: 'png',
    });

    expect(current).toBe(true);
    expect(mimeType).toBe('image/png');
    expect(data).toEqual(Buffer.from('iVBORw0KGgo=', 'base64'));
  });

  it.each([
    { version: () => '1762315200123', extension: 'png' },
    { version: () => '0123456789abcdef', extension: 'png' },
    { version: () => version, extension: 'webp' },
  ])(
    '版本或副檔名過期時回目前的圖片，並標示不是目前的版本：%o',
    async ({ version, extension }) => {
      const { current, mimeType, data } = await service.find({
        kind: 'banner',
        id: 'banner-1',
        version: version(),
        extension,
      });

      expect(current).toBe(false);
      expect(mimeType).toBe('image/png');
      expect(data).toEqual(Buffer.from('iVBORw0KGgo=', 'base64'));
    },
  );

  it.each(['missing', 'banner-2'])(
    '找不到資料或圖片無法辨識時回 404：%s',
    async (id) => {
      await expect(
        service.find({ kind: 'banner', id, version, extension: 'png' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  describe('圖片已搬到物件儲存', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('舊網址回物件儲存上目前的圖片，並標示不是目前的版本', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(Buffer.from('iVBORw0KGgo=', 'base64'), {
          headers: { 'content-type': 'image/png' },
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { current, mimeType, data } = await service.find({
        kind: 'banner',
        id: 'banner-3',
        version,
        extension: 'png',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://images.example.com/banner/0123456789abcdef.png',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(current).toBe(false);
      expect(mimeType).toBe('image/png');
      expect(data).toEqual(Buffer.from('iVBORw0KGgo=', 'base64'));
    });

    it.each([
      [404, 'image/png'],
      [200, 'text/html'],
    ])('物件儲存回 %s、%s 時回 404', async (status, contentType) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('x', {
            status,
            headers: { 'content-type': contentType },
          }),
        ),
      );

      await expect(
        service.find({
          kind: 'banner',
          id: 'banner-3',
          version,
          extension: 'png',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
