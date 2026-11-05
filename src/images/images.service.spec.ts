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

  it('回傳解碼後的圖片與 MIME 類型', async () => {
    const { mimeType, data } = await service.find({
      kind: 'banner',
      id: 'banner-1',
      version,
      extension: 'png',
    });

    expect(mimeType).toBe('image/png');
    expect(data).toEqual(Buffer.from('iVBORw0KGgo=', 'base64'));
  });

  it.each([
    { id: 'missing', version: () => version, extension: 'png' },
    { id: 'banner-1', version: () => '1', extension: 'png' },
    { id: 'banner-1', version: () => version, extension: 'webp' },
  ])('網址和目前的圖片不符時回 404：%o', async ({ id, version, extension }) => {
    await expect(
      service.find({ kind: 'banner', id, version: version(), extension }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
