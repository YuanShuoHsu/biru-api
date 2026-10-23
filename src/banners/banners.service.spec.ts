import { BadRequestException } from '@nestjs/common';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { BannersService } from './banners.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('BannersService', () => {
  let client: PGlite;
  let service: BannersService;

  beforeAll(async () => {
    client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new BannersService(db as unknown as DrizzleDB);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate banner');
  });

  it('前台只回傳啟用且在上下架時間內的橫幅', async () => {
    const now = Date.now();
    const at = (offset: number) => new Date(now + offset).toISOString();
    for (const [image, fields] of [
      ['always', {}],
      ['running', { startsAt: at(-DAY_MS), endsAt: at(DAY_MS) }],
      ['scheduled', { startsAt: at(DAY_MS) }],
      ['ended', { endsAt: at(-DAY_MS) }],
      ['inactive', { isActive: false }],
    ] as const)
      await service.create({ image, ...fields });

    expect((await service.findAllActive()).map(({ image }) => image)).toEqual([
      'always',
      'running',
    ]);
  });

  it('更新時可以設定與清除替代文字、連結與上下架時間', async () => {
    const { id } = await service.create({
      image: 'banner',
      alt: { 'zh-TW': '秋季新品' },
      url: '/order',
      startsAt: '2026-10-01T00:00:00Z',
      endsAt: '2026-11-01T00:00:00Z',
    });

    const cleared = await service.update(id, {
      alt: null,
      url: null,
      startsAt: null,
      endsAt: null,
    });
    expect(cleared).toMatchObject({
      alt: null,
      url: null,
      startsAt: null,
      endsAt: null,
    });

    const updated = await service.update(id, {
      endsAt: '2026-12-01T00:00:00Z',
    });
    expect(updated.endsAt).toEqual(new Date('2026-12-01T00:00:00Z'));
    expect(updated.startsAt).toBeNull();
  });

  it('只更新其中一個時間時，仍與既有的時間比對先後', async () => {
    const { id } = await service.create({
      image: 'banner',
      startsAt: '2026-10-01T00:00:00Z',
    });

    await expect(
      service.update(id, { endsAt: '2026-09-01T00:00:00Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
