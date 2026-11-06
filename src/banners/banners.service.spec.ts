import { BadRequestException } from '@nestjs/common';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { I18nContext } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { BannersService } from './banners.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('BannersService', () => {
  let client: PGlite;
  let service: BannersService;

  beforeAll(async () => {
    client = createPGlite();
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
    const ids = new Map<string, string>();
    for (const [label, fields] of [
      ['always', {}],
      ['running', { startsAt: at(-DAY_MS), endsAt: at(DAY_MS) }],
      ['scheduled', { startsAt: at(DAY_MS) }],
      ['ended', { endsAt: at(-DAY_MS) }],
      ['inactive', { isActive: false }],
    ] as const)
      ids.set(label, (await service.create({ image: label, ...fields })).id);

    expect((await service.findAllActive()).map(({ id }) => id)).toEqual([
      ids.get('always'),
      ids.get('running'),
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

  it('找不到橫幅時回 404，帶代碼與翻譯後的訊息', async () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string) => `translated:${key}`,
    } as unknown as I18nContext);

    await expect(service.remove('missing')).rejects.toMatchObject({
      response: {
        code: 'bannerNotFound',
        message: 'translated:common.banners.bannerNotFound',
      },
      status: 404,
    });
    vi.restoreAllMocks();
  });

  describe('reorder', () => {
    const sortOrders = async () =>
      (
        await client.query<{ id: string; sort_order: number }>(
          'select id, sort_order from banner order by sort_order, created_at',
        )
      ).rows;

    it('刪除留下空號後調整第 2 頁，只在該頁原本的排序值之間互換', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 14; i++)
        ids.push((await service.create({ image: `banner-${i}` })).id);
      await service.removeMany([ids[2], ids[5]]);
      const firstPage = (await sortOrders()).slice(0, 10);

      await service.reorder([ids[13], ids[12]]);

      const rows = await sortOrders();
      expect(rows.slice(0, 10)).toEqual(firstPage);
      expect(rows.slice(10)).toEqual([
        { id: ids[13], sort_order: 12 },
        { id: ids[12], sort_order: 13 },
      ]);
    });

    it('排序值重複時仍依新順序排成遞增', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++)
        ids.push((await service.create({ image: `banner-${i}` })).id);
      await client.exec('update banner set sort_order = 4');

      await service.reorder([ids[2], ids[0], ids[1]]);

      expect(await sortOrders()).toEqual([
        { id: ids[2], sort_order: 4 },
        { id: ids[0], sort_order: 5 },
        { id: ids[1], sort_order: 6 },
      ]);
    });

    it('略過不存在的 id', async () => {
      const { id } = await service.create({ image: 'banner' });

      await service.reorder([crypto.randomUUID(), id]);

      expect(await sortOrders()).toEqual([{ id, sort_order: 0 }]);
    });
  });
});
