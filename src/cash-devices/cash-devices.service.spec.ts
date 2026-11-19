import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { from, lastValueFrom } from 'rxjs';

import { createPGlite } from '../../test/pglite.js';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { CashDevicesController } from './cash-devices.controller.js';
import { CashDevicesService } from './cash-devices.service.js';

const KEY = '0b9a3c4e-6f1d-4c2a-9e8b-7d5f3a1c2b4e';
const OTHER_KEY = '5e2f8a1b-3c4d-4e6f-8a9b-0c1d2e3f4a5b';

describe('CashDevicesService', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: CashDevicesService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new CashDevicesService(db as unknown as DrizzleDB);
    await client.exec(
      `insert into "user" (id, name, first_name, email, lang) values ('staff', 'Staff', 'Staff', 'staff@example.com', 'zh-TW');`,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(`
      delete from cash_device_event;
      delete from cash_device;
      truncate audit_log, organization cascade;
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
      `insert into cash_device_event (id, organization_id, device_id, type, idempotency_key, amount, occurred_at)
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

  it('同一台機台的 idempotency_key 不能重複、不能為空，不同機台可以', async () => {
    const first = await service.create('biru', { name: '一號' });
    const second = await service.create('biru', { name: '二號' });
    const insert = (id: string, deviceId: string, key: string | null) =>
      client.query(
        `insert into cash_device_event (id, organization_id, device_id, type, idempotency_key, occurred_at)
         values ($1, 'biru', $2, 'error', $3, now())`,
        [id, deviceId, key],
      );

    await insert('e1', first.id, 'tx-1');
    await insert('e2', second.id, 'tx-1');

    await expect(insert('e3', first.id, null)).rejects.toThrow();
    await expect(insert('e4', first.id, 'tx-1')).rejects.toThrow();
  });

  describe('補幣與收鈔', () => {
    const refill = (
      deviceId: string,
      denominations: Record<string, number> = { '10': 20, '50': 4, '100': 0 },
      idempotencyKey = KEY,
    ) =>
      service.refill('biru', deviceId, 'staff', {
        idempotencyKey,
        denominations,
      });

    it('補幣的金額由面額張數算出，略過張數為 0 的面額並記下操作者', async () => {
      const device = await service.create('biru', { name: '櫃台' });

      const event = await refill(device.id, { '10': 20, '50': 4, '100': 0 });

      expect(event).toMatchObject({
        organizationId: 'biru',
        deviceId: device.id,
        type: 'refill',
        idempotencyKey: KEY,
        denominations: { '10': 20, '50': 4 },
        amount: '400.00',
        reportedAmount: null,
        depositedAmount: null,
        difference: null,
        createdBy: 'staff',
        occurredAt: expect.any(Date),
      });
    });

    it('全部張數為 0 的補幣回 400 cashDeviceRefillEmpty', async () => {
      const device = await service.create('biru', { name: '櫃台' });

      const { error, response } = await codeOf(refill(device.id, { '10': 0 }));

      expect(error).toBeInstanceOf(BadRequestException);
      expect(response).toMatchObject({ code: 'cashDeviceRefillEmpty' });
    });

    it('收鈔記下機台回報與實際存入金額，回應帶差額', async () => {
      const device = await service.create('biru', { name: '櫃台' });

      const event = await service.collect('biru', device.id, 'staff', {
        idempotencyKey: KEY,
        reportedAmount: 12500,
        depositedAmount: 12400,
        note: '少一張百元',
      });

      expect(event).toMatchObject({
        type: 'collection',
        denominations: {},
        amount: null,
        reportedAmount: '12500.00',
        depositedAmount: '12400.00',
        difference: '-100.00',
        note: '少一張百元',
        createdBy: 'staff',
      });
    });

    it('同一把 key 重送內容相同時回傳原紀錄，不重複寫入', async () => {
      const device = await service.create('biru', { name: '櫃台' });

      const first = await refill(device.id, { '50': 4, '10': 20 });
      const again = await refill(device.id, { '10': 20, '50': 4, '5': 0 });
      const [left, right] = await Promise.all([
        refill(device.id, { '1': 3 }, OTHER_KEY),
        refill(device.id, { '1': 3 }, OTHER_KEY),
      ]);

      expect(again).toEqual(first);
      expect(right).toEqual(left);
      await expect(
        service.findEvents('biru', device.id, {}),
      ).resolves.toMatchObject({ total: 2 });
    });

    it('同一把 key 重送不同內容時回 409 idempotencyConflict', async () => {
      const device = await service.create('biru', { name: '櫃台' });
      await refill(device.id, { '10': 20 });

      for (const attempt of [
        refill(device.id, { '10': 21 }),
        service.collect('biru', device.id, 'staff', {
          idempotencyKey: KEY,
          reportedAmount: 200,
          depositedAmount: 200,
        }),
      ]) {
        const { error, response } = await codeOf(attempt);
        expect(error).toBeInstanceOf(ConflictException);
        expect(response).toMatchObject({ code: 'idempotencyConflict' });
      }
    });

    it('停用的機台不能補幣或收鈔，但停用前已記下的紀錄重送仍回傳原紀錄', async () => {
      const device = await service.create('biru', { name: '櫃台' });
      const recorded = await refill(device.id);
      await service.update('biru', device.id, { status: 'inactive' });

      for (const attempt of [
        refill(device.id, { '10': 1 }, OTHER_KEY),
        service.collect('biru', device.id, 'staff', {
          idempotencyKey: OTHER_KEY,
          reportedAmount: 0,
          depositedAmount: 0,
        }),
      ]) {
        const { error, response } = await codeOf(attempt);
        expect(error).toBeInstanceOf(ConflictException);
        expect(response).toMatchObject({ code: 'cashDeviceInactive' });
      }
      await expect(refill(device.id)).resolves.toEqual(recorded);
    });

    it('別店的機台當作不存在，不能補幣、收鈔或查紀錄', async () => {
      const other = await service.create('cafe', { name: '別店' });

      for (const attempt of [
        refill(other.id),
        service.collect('biru', other.id, 'staff', {
          idempotencyKey: KEY,
          reportedAmount: 0,
          depositedAmount: 0,
        }),
        service.findEvents('biru', other.id, {}),
      ]) {
        const { error, response } = await codeOf(attempt);
        expect(error).toBeInstanceOf(NotFoundException);
        expect(response).toMatchObject({ code: 'cashDeviceNotFound' });
      }
    });

    it('紀錄列表只列該機台的，新的在前並分頁', async () => {
      const device = await service.create('biru', { name: '櫃台' });
      const other = await service.create('biru', { name: '入口' });
      const older = await refill(device.id);
      await client.query(
        `update cash_device_event set occurred_at = occurred_at - interval '1 hour' where id = $1`,
        [older.id],
      );
      const newer = await service.collect('biru', device.id, 'staff', {
        idempotencyKey: OTHER_KEY,
        reportedAmount: 100,
        depositedAmount: 100,
      });
      await refill(other.id);

      await expect(
        service.findEvents('biru', device.id, {}),
      ).resolves.toMatchObject({
        data: [{ id: newer.id, difference: '0.00' }, { id: older.id }],
        total: 2,
      });
      await expect(
        service.findEvents('biru', device.id, { limit: 1, offset: 1 }),
      ).resolves.toMatchObject({ data: [{ id: older.id }], total: 2 });
    });

    it('補幣寫一筆機台的異動紀錄，重送不再寫', async () => {
      const device = await service.create('biru', { name: '櫃台' });
      const interceptor = new AuditInterceptor(
        new Reflector(),
        db as unknown as DrizzleDB,
      );
      const body = { idempotencyKey: KEY, denominations: { '10': 20 } };
      const request = {
        body,
        method: 'POST',
        organizationId: 'biru',
        params: { organizationSlug: 'biru', cashDeviceId: device.id },
        user: { id: 'staff', name: 'Staff', email: 'staff@example.com' },
      };
      const handler: unknown = Reflect.get(
        CashDevicesController.prototype,
        'refill',
      );
      const context = {
        getClass: () => CashDevicesController,
        getHandler: () => handler,
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      const send = async () => {
        const next: CallHandler = {
          handle: () => from(service.refill('biru', device.id, 'staff', body)),
        };
        await lastValueFrom(interceptor.intercept(context, next));
      };

      await send();
      await vi.waitFor(async () =>
        expect(await db.select().from(schema.auditLog)).toEqual([
          expect.objectContaining({
            action: 'update',
            resource: 'cashDevice',
            resourceId: device.id,
            changes: expect.objectContaining({
              type: { before: null, after: 'refill' },
              amount: { before: null, after: '200.00' },
            }),
          }),
        ]),
      );

      await send();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(await db.select().from(schema.auditLog)).toHaveLength(1);
    });
  });
});
