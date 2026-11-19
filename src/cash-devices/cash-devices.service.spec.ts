import { ConflictException, NotFoundException } from '@nestjs/common';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { CashDevicesService } from './cash-devices.service.js';

describe('CashDevicesService', () => {
  let client: PGlite;
  let service: CashDevicesService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new CashDevicesService(db as unknown as DrizzleDB);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(`
      delete from cash_device_event;
      delete from cash_device;
      truncate organization cascade;
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
        ('biru', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
        ('cafe', 'Cafe', 'cafe', now(), 'TW', '桃園市', '大園區', '中正東路一段');
    `);
  });

  const codeOf = async (promise: Promise<unknown>) => {
    const error = await promise.catch((caught: unknown) => caught);

    return {
      error,
      response: (error as NotFoundException).getResponse(),
    };
  };

  it('新增的機台預設啟用，列表只列自己門市的並依名稱排序', async () => {
    const counter = await service.create('biru', {
      name: '櫃台',
      vendor: '廠商',
      model: 'X1',
    });
    const entrance = await service.create('biru', { name: '入口' });
    await service.create('cafe', { name: '別店' });

    expect(counter).toMatchObject({
      organizationId: 'biru',
      name: '櫃台',
      vendor: '廠商',
      model: 'X1',
      status: 'active',
      lastSeenAt: null,
    });
    expect(entrance).toMatchObject({ vendor: null, model: null });
    await expect(service.findAll('biru')).resolves.toEqual({
      data: [entrance, counter],
      total: 2,
    });
    await expect(
      service.findAll('biru', { quickFilterValue: '廠商' }),
    ).resolves.toEqual({ data: [counter], total: 1 });
    await expect(service.findOne('biru', counter.id)).resolves.toEqual(counter);
  });

  it('修改只動帶上的欄位，null 清空選填欄位', async () => {
    const created = await service.create('biru', {
      name: '櫃台',
      vendor: '廠商',
      model: 'X1',
    });

    const updated = await service.update('biru', created.id, {
      status: 'inactive',
      vendor: null,
    });

    expect(updated).toMatchObject({
      name: '櫃台',
      vendor: null,
      model: 'X1',
      status: 'inactive',
    });
    await expect(
      service.findAll('biru', {
        filterField: 'status',
        filterOperator: 'is',
        filterValue: 'inactive',
      }),
    ).resolves.toEqual({ data: [updated], total: 1 });
  });

  it('別店的機台當作不存在，不能讀、改、刪', async () => {
    const other = await service.create('cafe', { name: '別店' });

    for (const attempt of [
      service.findOne('biru', other.id),
      service.update('biru', other.id, { name: '改名' }),
      service.update('biru', other.id, {}),
      service.remove('biru', other.id),
    ]) {
      const { error, response } = await codeOf(attempt);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(response).toMatchObject({ code: 'cashDeviceNotFound' });
    }
    await expect(service.findOne('cafe', other.id)).resolves.toMatchObject({
      name: '別店',
    });
  });

  it('沒有交易紀錄的機台可以刪除', async () => {
    const created = await service.create('biru', { name: '櫃台' });

    await service.remove('biru', created.id);

    await expect(service.findAll('biru')).resolves.toEqual({
      data: [],
      total: 0,
    });
  });

  it('已有交易紀錄的機台刪除時回 409 cashDeviceInUse 並保留機台', async () => {
    const created = await service.create('biru', { name: '櫃台' });
    await client.query(
      `insert into cash_device_event (id, organization_id, device_id, type, external_id, amount, occurred_at)
       values ('e1', 'biru', $1, 'payment', 'tx-1', 100, now())`,
      [created.id],
    );

    const { error, response } = await codeOf(
      service.remove('biru', created.id),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(response).toMatchObject({ code: 'cashDeviceInUse' });
    await expect(service.findOne('biru', created.id)).resolves.toEqual(created);
  });

  it('同一台機台的 external_id 不能重複，不同機台可以', async () => {
    const first = await service.create('biru', { name: '一號' });
    const second = await service.create('biru', { name: '二號' });
    const insert = (id: string, deviceId: string, externalId: string | null) =>
      client.query(
        `insert into cash_device_event (id, organization_id, device_id, type, external_id, occurred_at)
         values ($1, 'biru', $2, 'error', $3, now())`,
        [id, deviceId, externalId],
      );

    await insert('e1', first.id, 'tx-1');
    await insert('e2', second.id, 'tx-1');
    await insert('e3', first.id, null);
    await insert('e4', first.id, null);

    await expect(insert('e5', first.id, 'tx-1')).rejects.toThrow();
  });
});
