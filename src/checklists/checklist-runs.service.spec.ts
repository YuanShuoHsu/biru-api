import { BadRequestException } from '@nestjs/common';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import { platformDateString } from '../common/constants/timezone.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { ChecklistRunsService } from './checklist-runs.service.js';
import { ChecklistTemplatesService } from './checklist-templates.service.js';

const amy = { id: 'amy', name: 'Amy' };
const temperature = {
  label: '冷藏庫溫度',
  type: 'number' as const,
  unit: '°C',
  minValue: 0,
  maxValue: 7,
};

describe('ChecklistRunsService', () => {
  let client: PGlite;
  let templates: ChecklistTemplatesService;
  let service: ChecklistRunsService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    templates = new ChecklistTemplatesService(db as unknown as DrizzleDB);
    service = new ChecklistRunsService(db as unknown as DrizzleDB, templates);
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
      insert into "user" (id, name, email, first_name) values ('amy', 'Amy', 'amy@example.com', 'Amy')
        on conflict (id) do nothing;
      insert into checklist_setting (organization_id, default_templates_created_at) values
        ('biru', now()), ('cafe', now());
    `);
  });

  const createTemplate = () =>
    templates.create('biru', {
      name: '開店',
      timing: 'opening',
      items: [{ label: '開燈', type: 'check' }, temperature],
    });

  const runCount = async () =>
    (
      await client.query<{ count: number }>(
        'select count(*)::int as count from checklist_run',
      )
    ).rows[0].count;

  it('第一次讀取時只建立一次三份預設範本，刪光後也不會重建', async () => {
    await client.exec('truncate checklist_setting');

    await Promise.all([
      service.today('biru'),
      service.today('biru'),
      templates.findAllWithDefaults('biru'),
    ]);

    const created = await templates.findAll('biru');
    expect(created.map(({ name, timing }) => [name, timing])).toEqual([
      ['開店', 'opening'],
      ['打烊', 'closing'],
      ['冷藏冷凍溫度', 'anytime'],
    ]);
    expect(created[2].items).toMatchObject([
      { type: 'number', unit: '°C', minValue: 0, maxValue: 7 },
      { type: 'number', unit: '°C', minValue: null, maxValue: -18 },
    ]);

    for (const { id } of created) await templates.remove('biru', id);
    await expect(service.today('biru')).resolves.toEqual([]);
    await expect(templates.findAll('cafe')).resolves.toEqual([]);
  });

  it('先自行新增範本的門市之後不會被加上預設範本', async () => {
    await client.exec('truncate checklist_setting');
    const template = await createTemplate();

    await expect(service.today('biru')).resolves.toMatchObject([
      { templateId: template.id },
    ]);
  });

  it('停業門市不建立預設範本，也不能填寫', async () => {
    const template = await createTemplate();
    await client.exec(`
      truncate checklist_setting;
      update organization set closed_at = now();
    `);

    await expect(templates.findAllWithDefaults('cafe')).resolves.toEqual([]);
    await expect(
      service.fill(
        'biru',
        template.id,
        template.items[0].id,
        { checked: true },
        amy,
      ),
    ).rejects.toMatchObject({ response: { code: 'organizationReadOnly' } });
    await expect(runCount()).resolves.toBe(0);
    const { rows } = await client.query('select * from checklist_setting');
    expect(rows).toEqual([]);
  });

  it('尚未開始的範本以範本現況呈現，停用的不列出', async () => {
    const template = await createTemplate();
    await templates.create('biru', {
      name: '打烊',
      timing: 'closing',
      enabled: false,
      items: [],
    });

    await expect(service.today('biru')).resolves.toEqual([
      {
        id: null,
        templateId: template.id,
        businessDate: platformDateString(new Date()),
        name: '開店',
        timing: 'opening',
        startedAt: null,
        completedAt: null,
        filledCount: 0,
        items: [
          expect.objectContaining({ label: '開燈', checked: null }),
          expect.objectContaining({ ...temperature, value: null }),
        ],
      },
    ]);
  });

  it('營業日以台灣日曆日計算', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T16:30:00Z'));
    try {
      const template = await createTemplate();
      const run = await service.fill(
        'biru',
        template.id,
        template.items[0].id,
        { checked: true },
        amy,
      );
      expect(run.businessDate).toBe('2026-11-17');
    } finally {
      vi.useRealTimers();
    }
  });

  it('填寫建立當日紀錄並記下填寫人，全部填完才算完成，取消勾選後回到未完成', async () => {
    const template = await createTemplate();
    const [light, fridge] = template.items;

    const started = await service.fill(
      'biru',
      template.id,
      light.id,
      { checked: true },
      amy,
    );
    expect(started).toMatchObject({
      id: expect.any(String),
      completedAt: null,
      filledCount: 1,
      items: [
        { checked: true, filledByName: 'Amy', filledAt: expect.any(Date) },
        { value: null, filledByName: null },
      ],
    });

    const completed = await service.fill(
      'biru',
      template.id,
      fridge.id,
      { value: 4.5 },
      amy,
    );
    expect(completed).toMatchObject({
      id: started.id,
      completedAt: expect.any(Date),
      filledCount: 2,
      items: [{ checked: true }, { value: 4.5, outOfRange: false }],
    });

    const reopened = await service.fill(
      'biru',
      template.id,
      light.id,
      { checked: false },
      amy,
    );
    expect(reopened).toMatchObject({
      id: started.id,
      completedAt: null,
      filledCount: 1,
      items: [{ checked: false }, { value: 4.5 }],
    });
    await expect(runCount()).resolves.toBe(1);
    const { rows } = await client.query(
      'select filled_by from checklist_run_item',
    );
    expect(rows).toEqual([{ filled_by: 'amy' }, { filled_by: 'amy' }]);
  });

  it('超出範圍時必須填處置說明，否則不寫入；邊界值不算超出', async () => {
    const template = await createTemplate();
    const fridge = template.items[1];

    const error = await service
      .fill('biru', template.id, fridge.id, { value: 7.5 }, amy)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'checklistActionNoteRequired',
    });
    await expect(runCount()).resolves.toBe(0);

    const noted = await service.fill(
      'biru',
      template.id,
      fridge.id,
      { value: -1, actionNote: '已調整溫控並移出食材' },
      amy,
    );
    expect(noted.items[1]).toMatchObject({
      value: -1,
      outOfRange: true,
      actionNote: '已調整溫控並移出食材',
    });

    const edge = await service.fill(
      'biru',
      template.id,
      fridge.id,
      { value: 7 },
      amy,
    );
    expect(edge.items[1]).toMatchObject({
      value: 7,
      outOfRange: false,
      actionNote: null,
    });
  });

  it.each([
    [0, { value: 1 }],
    [0, {}],
    [1, { checked: true }],
    [1, { value: 3, checked: true }],
  ])('項目 %i 送 %j 時回 400', async (index, dto) => {
    const template = await createTemplate();

    await expect(
      service.fill('biru', template.id, template.items[index].id, dto, amy),
    ).rejects.toMatchObject({
      response: { code: 'checklistItemValueRequired' },
    });
  });

  it('開始後修改範本，填寫與今天的清單都以當日快照為準', async () => {
    const template = await createTemplate();
    const [light, fridge] = template.items;
    await service.fill('biru', template.id, light.id, { checked: true }, amy);

    const edited = await templates.update('biru', template.id, {
      name: '早班',
      items: [{ ...temperature, id: fridge.id, maxValue: 5 }, temperature],
    });

    await expect(
      service.fill('biru', template.id, edited.items[1].id, { value: 3 }, amy),
    ).rejects.toMatchObject({ response: { code: 'checklistItemNotFound' } });

    const run = await service.fill(
      'biru',
      template.id,
      fridge.id,
      { value: 6 },
      amy,
    );
    expect(run).toMatchObject({
      name: '開店',
      completedAt: expect.any(Date),
      filledCount: 2,
      items: [
        { id: light.id, checked: true },
        { id: fridge.id, maxValue: 7, value: 6, outOfRange: false },
      ],
    });
    await expect(service.today('biru')).resolves.toEqual([run]);
  });

  it('停用、別店或不存在的範本回 404', async () => {
    const template = await createTemplate();
    const other = await templates.create('cafe', {
      name: '開店',
      timing: 'opening',
      items: [{ label: '開燈', type: 'check' }],
    });
    await templates.update('biru', template.id, { enabled: false });

    for (const [templateId, itemId] of [
      [template.id, template.items[0].id],
      [other.id, other.items[0].id],
      [crypto.randomUUID(), template.items[0].id],
    ])
      await expect(
        service.fill('biru', templateId, itemId, { checked: true }, amy),
      ).rejects.toMatchObject({
        response: { code: 'checklistTemplateNotFound' },
      });
    await expect(runCount()).resolves.toBe(0);
  });

  it('同時填寫同一份檢查表只建立一筆當日紀錄', async () => {
    const template = await createTemplate();
    const [light, fridge] = template.items;

    await Promise.all([
      service.fill('biru', template.id, light.id, { checked: true }, amy),
      service.fill('biru', template.id, fridge.id, { value: 3 }, amy),
    ]);

    await expect(runCount()).resolves.toBe(1);
    const [today] = await service.today('biru');
    expect(today.completedAt).toEqual(expect.any(Date));
  });

  it('歷史紀錄依營業日新到舊，可依日期區間與範本篩選並分頁，只看自己門市', async () => {
    const template = await createTemplate();
    const other = await templates.create('biru', {
      name: '打烊',
      timing: 'closing',
      items: [],
    });
    await client.query(
      `insert into checklist_run (id, organization_id, template_id, business_date, template_snapshot) values
        ('r1', 'biru', $1, '2026-11-01', '{"name":"開店","timing":"opening","items":[]}'),
        ('r2', 'biru', $1, '2026-11-02', '{"name":"開店","timing":"opening","items":[]}'),
        ('r3', 'biru', $2, '2026-11-02', '{"name":"打烊","timing":"closing","items":[]}'),
        ('r4', 'biru', $1, '2026-11-03', '{"name":"開店","timing":"opening","items":[]}'),
        ('r5', 'cafe', null, '2026-11-02', '{"name":"開店","timing":"opening","items":[]}')`,
      [template.id, other.id],
    );
    const ids = async (query: Parameters<typeof service.findRuns>[1]) => {
      const { data, total } = await service.findRuns('biru', query);
      return { ids: data.map(({ id }) => id), total };
    };

    await expect(ids({})).resolves.toMatchObject({ total: 4 });
    await expect(
      ids({ from: '2026-11-02', to: '2026-11-03', templateId: template.id }),
    ).resolves.toEqual({ ids: ['r4', 'r2'], total: 2 });
    await expect(ids({ limit: 2, offset: 1 })).resolves.toMatchObject({
      ids: [expect.stringMatching(/^r[23]$/), expect.stringMatching(/^r[23]$/)],
      total: 4,
    });
    await expect(ids({ to: '2026-11-01' })).resolves.toEqual({
      ids: ['r1'],
      total: 1,
    });
  });
});
