import { ConflictException, NotFoundException } from '@nestjs/common';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { OperatingCostsService } from './operating-costs.service.js';

describe('OperatingCostsService', () => {
  let client: PGlite;
  let service: OperatingCostsService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new OperatingCostsService(db as unknown as DrizzleDB);
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

  const errorOf = (promise: Promise<unknown>) =>
    promise.catch((caught: unknown) => caught);

  it('列表只列自己門市的，預設依生效月份新到舊、再依類別排序', async () => {
    const rent = await service.create('biru', {
      category: 'rent',
      effectiveFrom: '2026-01',
      monthlyAmount: '60000',
    });
    const raised = await service.create('biru', {
      category: 'rent',
      effectiveFrom: '2026-11',
      monthlyAmount: '70000',
      note: '續約調漲',
    });
    const power = await service.create('biru', {
      category: 'electricity',
      effectiveFrom: '2026-01',
      monthlyAmount: '8000',
    });
    await service.create('cafe', {
      category: 'rent',
      effectiveFrom: '2026-01',
      monthlyAmount: '50000',
    });

    expect(rent).toMatchObject({
      organizationId: 'biru',
      monthlyAmount: '60000.00',
      note: null,
    });
    await expect(service.findAll('biru')).resolves.toEqual({
      data: [raised, rent, power],
      total: 3,
    });
    await expect(
      service.findAll('biru', { quickFilterValue: '調漲' }),
    ).resolves.toEqual({ data: [raised], total: 1 });
    await expect(
      service.findAll('biru', {
        filterField: 'effectiveFrom',
        filterOperator: 'is',
        filterValue: '2026-01',
      }),
    ).resolves.toMatchObject({ total: 2 });
  });

  it('同類別同一生效月份只能有一筆，新增或改成重複都回衝突', async () => {
    await service.create('biru', {
      category: 'rent',
      effectiveFrom: '2026-01',
      monthlyAmount: '60000',
    });
    const later = await service.create('biru', {
      category: 'rent',
      effectiveFrom: '2026-02',
      monthlyAmount: '60000',
    });

    for (const attempt of [
      service.create('biru', {
        category: 'rent',
        effectiveFrom: '2026-01',
        monthlyAmount: '1',
      }),
      service.update('biru', later.id, { effectiveFrom: '2026-01' }),
    ]) {
      const error = await errorOf(attempt);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'operatingCostExists',
      });
    }
  });

  it('修改只動帶上的欄位，null 清空備註', async () => {
    const created = await service.create('biru', {
      category: 'water',
      effectiveFrom: '2026-01',
      monthlyAmount: '1000',
      note: '估計',
    });

    await expect(
      service.update('biru', created.id, { monthlyAmount: '0', note: null }),
    ).resolves.toMatchObject({
      category: 'water',
      effectiveFrom: '2026-01',
      monthlyAmount: '0.00',
      note: null,
    });
  });

  it('別店的固定成本當作不存在，不能讀、改、刪', async () => {
    const other = await service.create('cafe', {
      category: 'rent',
      effectiveFrom: '2026-01',
      monthlyAmount: '50000',
    });

    for (const attempt of [
      service.findOne('biru', other.id),
      service.update('biru', other.id, { monthlyAmount: '1' }),
      service.update('biru', other.id, {}),
      service.remove('biru', other.id),
    ]) {
      const error = await errorOf(attempt);
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'operatingCostNotFound',
      });
    }
    await expect(service.findOne('cafe', other.id)).resolves.toEqual(other);
  });

  it('刪除後不再列出', async () => {
    const created = await service.create('biru', {
      category: 'gas',
      effectiveFrom: '2026-01',
      monthlyAmount: '800',
    });

    await service.remove('biru', created.id);

    await expect(service.findAll('biru')).resolves.toEqual({
      data: [],
      total: 0,
    });
  });
});
