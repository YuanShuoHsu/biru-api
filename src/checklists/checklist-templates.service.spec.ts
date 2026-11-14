import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { ChecklistTemplatesService } from './checklist-templates.service.js';

const temperature = {
  label: '冷藏庫溫度',
  type: 'number' as const,
  unit: '°C',
  minValue: 0,
  maxValue: 7,
};

describe('ChecklistTemplatesService', () => {
  let client: PGlite;
  let service: ChecklistTemplatesService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new ChecklistTemplatesService(db as unknown as DrizzleDB);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(`
      truncate organization cascade;
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
        ('biru', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
        ('cafe', 'Cafe', 'cafe', now(), 'TW', '桃園市', '大園區', '中正東路一段');
    `);
  });

  it('新增後依序列出範本與項目，勾選項目不留單位與範圍', async () => {
    const opening = await service.create('biru', {
      name: '開店',
      timing: 'opening',
      items: [
        { label: '開燈', type: 'check', unit: '盞', minValue: 1, maxValue: 2 },
        temperature,
      ],
    });
    const closing = await service.create('biru', {
      name: '打烊',
      timing: 'closing',
      enabled: false,
      items: [],
    });

    expect(opening).toMatchObject({
      organizationId: 'biru',
      enabled: true,
      sortOrder: 0,
      items: [
        {
          label: '開燈',
          type: 'check',
          unit: null,
          minValue: null,
          maxValue: null,
          sortOrder: 0,
        },
        { ...temperature, sortOrder: 1 },
      ],
    });
    expect(closing).toMatchObject({ enabled: false, sortOrder: 1, items: [] });
    await expect(service.findAll('biru')).resolves.toEqual([opening, closing]);
    await expect(service.findAll('cafe')).resolves.toEqual([]);
  });

  it('下限大於上限時拒絕，不寫入範本', async () => {
    const error = await service
      .create('biru', {
        name: '溫度',
        timing: 'anytime',
        items: [{ ...temperature, minValue: 8 }],
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'checklistItemInvalidRange',
    });
    await expect(service.findAll('biru')).resolves.toEqual([]);
  });

  it('更新時帶 items 整組替換，不帶就保留', async () => {
    const created = await service.create('biru', {
      name: '溫度',
      timing: 'anytime',
      items: [temperature, { label: '冷凍庫', type: 'number' }],
    });

    const renamed = await service.update('biru', created.id, { name: '設備' });
    expect(renamed.items).toEqual(created.items);

    const replaced = await service.update('biru', created.id, {
      items: [{ ...temperature, maxValue: 5 }],
    });
    expect(replaced).toMatchObject({
      name: '設備',
      items: [{ ...temperature, maxValue: 5, sortOrder: 0 }],
    });

    await expect(
      service.update('biru', created.id, {
        items: [{ ...temperature, minValue: 6, maxValue: 5 }],
      }),
    ).rejects.toMatchObject({
      response: { code: 'checklistItemInvalidRange' },
    });
  });

  it('別店的範本更新與刪除都回 404，也不會被改到', async () => {
    const other = await service.create('cafe', {
      name: '開店',
      timing: 'opening',
      items: [temperature],
    });

    await expect(
      service.update('biru', other.id, { name: '改名', items: [] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('biru', other.id)).rejects.toMatchObject({
      response: { code: 'checklistTemplateNotFound' },
    });
    await expect(service.findAll('cafe')).resolves.toEqual([other]);
  });

  it('刪除範本連同項目，保留執行紀錄的快照', async () => {
    const created = await service.create('biru', {
      name: '開店',
      timing: 'opening',
      items: [temperature],
    });
    await client.query(
      `insert into checklist_run (id, organization_id, template_id, business_date, template_snapshot)
       values ('run', 'biru', $1, '2026-11-14', '{}')`,
      [created.id],
    );

    await service.remove('biru', created.id);

    await expect(service.findAll('biru')).resolves.toEqual([]);
    const { rows } = await client.query(
      `select template_id, (select count(*)::int from checklist_template_item) as items from checklist_run`,
    );
    expect(rows).toEqual([{ template_id: null, items: 0 }]);
  });

  it('排序只動自己門市的範本', async () => {
    const create = (name: string) =>
      service.create('biru', { name, timing: 'anytime', items: [] });
    const first = await create('開店');
    const second = await create('打烊');
    const third = await create('溫度');
    const other = await service.create('cafe', {
      name: '開店',
      timing: 'opening',
      items: [],
    });

    await service.reorder('biru', [third.id, other.id, first.id, second.id]);

    const ordered = await service.findAll('biru');
    expect(ordered.map(({ id }) => id)).toEqual([
      third.id,
      first.id,
      second.id,
    ]);
    await expect(service.findAll('cafe')).resolves.toMatchObject([
      { id: other.id, sortOrder: other.sortOrder },
    ]);
  });
});
