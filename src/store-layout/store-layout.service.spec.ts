import { readFileSync } from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';
import { from, lastValueFrom } from 'rxjs';

import { createPGlite } from '../../test/pglite.js';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor.js';
import * as schema from '../db/schema/index.js';
import { auditLog } from '../db/schema/audit.js';
import type { StoreLayoutData } from '../db/schema/store-layout.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { StoreLayoutController } from './store-layout.controller.js';
import { StoreLayoutService } from './store-layout.service.js';

const ORG = 'org-biru';

const box = {
  floor: 'ground',
  x: 1,
  z: 2,
  width: 1,
  depth: 1,
  height: 0.75,
  elevation: 0,
} as const;

const layout = (tableNumbers: number[]): StoreLayoutData => ({
  items: tableNumbers.map((tableNumber) => ({
    ...box,
    kind: 'seat',
    label: 'table',
    tableNumber,
  })),
  seats: [{ ...box, label: 'chair' }],
});

describe('StoreLayoutService', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: StoreLayoutService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new StoreLayoutService(
      db as unknown as DrizzleDB,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      `truncate audit_log, organization cascade;
       insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('${ORG}', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');`,
    );
  });

  it('門市還沒有平面圖時回 404', async () => {
    await expect(service.get('biru')).rejects.toThrow(
      new NotFoundException('common.storeLayout.notFound'),
    );
  });

  it('門市不存在時回 404', async () => {
    await expect(service.get('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.update('missing', layout([1]))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('第一次 PUT 建立，之後整份取代並更新時間', async () => {
    const created = await service.update('biru', layout([1, 2]));
    expect(created).toEqual({
      organizationId: ORG,
      schemaVersion: 1,
      data: layout([1, 2]),
      updatedAt: expect.any(Date),
    });

    await client.exec(
      `update store_layout set updated_at = '2000-01-01' where organization_id = '${ORG}'`,
    );
    const updated = await service.update('biru', layout([3]));
    expect(updated.data).toEqual(layout([3]));
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      new Date('2000-01-02').getTime(),
    );
    await expect(service.get('biru')).resolves.toEqual(updated);
  });

  it('桌號重複時回 400 且不寫入', async () => {
    await expect(service.update('biru', layout([5, 5]))).rejects.toThrow(
      new BadRequestException('common.storeLayout.duplicateTableNumber'),
    );
    await expect(service.get('biru')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('刪除門市時一併刪除平面圖', async () => {
    await service.update('biru', layout([1]));
    await client.exec(`delete from organization where id = '${ORG}'`);

    expect(await db.query.storeLayout.findMany()).toEqual([]);
  });

  it('migration 的種子資料只寫進 slug 為 biru 的門市且不覆蓋既有資料', async () => {
    const seed = readFileSync('./drizzle/0245_store_layout.sql', 'utf8')
      .split('--> statement-breakpoint')
      .find((statement) => statement.includes('INSERT INTO "store_layout"'));
    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段');`,
    );

    await client.exec(seed ?? '');
    const seeded = await service.get('biru');
    expect(seeded.data.items).toHaveLength(138);
    expect(seeded.data.seats).toHaveLength(343);
    await expect(service.get('other')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    await service.update('biru', layout([1]));
    await client.exec(seed ?? '');
    expect((await service.get('biru')).data).toEqual(layout([1]));
  });

  it('PUT 以門市為對象寫入異動紀錄', async () => {
    const interceptor = new AuditInterceptor(
      new Reflector(),
      db as unknown as DrizzleDB,
    );
    const request = {
      body: { data: layout([1]) },
      method: 'PUT',
      organizationId: ORG,
      params: { organizationSlug: 'biru' },
      user: { id: 'admin', name: '管理員', email: 'admin@example.com' },
    };
    const handler: unknown = Reflect.get(
      StoreLayoutController.prototype,
      'update',
    );
    const context = {
      getClass: () => StoreLayoutController,
      getHandler: () => handler,
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => from(service.update('biru', layout([1]))),
    };

    await lastValueFrom(interceptor.intercept(context, next));

    await vi.waitFor(async () =>
      expect(await db.select().from(auditLog)).toEqual([
        expect.objectContaining({
          action: 'update',
          organizationId: ORG,
          resource: 'organization',
          resourceId: ORG,
          resourceLabel: 'Biru',
          changes: expect.objectContaining({
            data: { before: null, after: layout([1]) },
          }),
        }),
      ]),
    );
  });
});
