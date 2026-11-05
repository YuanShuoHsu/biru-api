import { NotFoundException } from '@nestjs/common';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

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

    const [row] = await db
      .insert(schema.banner)
      .values({ id: 'banner-1', image: 'data:image/png;base64,iVBORw0KGgo=' })
      .returning();
    version = String(row.updatedAt.getTime());
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
    { version: () => '1', extension: 'png' },
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

  it('找不到圖片時回 404', async () => {
    await expect(
      service.find({
        kind: 'banner',
        id: 'missing',
        version,
        extension: 'png',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
