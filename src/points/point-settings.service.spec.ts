import { PGlite } from '@electric-sql/pglite';
import { Reflector } from '@nestjs/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import { from, lastValueFrom } from 'rxjs';

import { AuditInterceptor } from '../common/interceptors/audit.interceptor.js';
import * as schema from '../db/schema/index.js';
import { auditLog } from '../db/schema/audit.js';
import { order } from '../db/schema/orders.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { POINTS_SNAPSHOT_SET } from '../orders/points-snapshot.js';

import { AdminPointSettingsController } from './admin-point-settings.controller.js';
import { PointSettingsService } from './point-settings.service.js';

describe('PointSettingsService', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: PointSettingsService;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new PointSettingsService(db as unknown as DrizzleDB);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      `truncate audit_log, "order", organization cascade;
       update point_setting set amount_per_point = null, points_enabled_at = null, points_validity_years = null, accounting_value_per_point = null`,
    );
  });

  it('沒有啟用的門市時 migration 留下一列空設定', async () => {
    await expect(service.get()).resolves.toMatchObject({
      id: 'brand',
      amountPerPoint: null,
      pointsEnabledAt: null,
    });
  });

  it('每點金額改成有值時補上啟用時間，之後再改不會重設', async () => {
    const enabled = await service.update({
      amountPerPoint: 50,
      pointsValidityYears: 1,
    });

    expect(enabled).toMatchObject({
      amountPerPoint: '50.00',
      pointsEnabledAt: expect.any(Date),
      pointsValidityYears: 1,
    });
    await expect(
      service.update({ accountingValuePerPoint: 0.5, amountPerPoint: 30 }),
    ).resolves.toMatchObject({
      accountingValuePerPoint: '0.50',
      amountPerPoint: '30.00',
      pointsEnabledAt: enabled.pointsEnabledAt,
      pointsValidityYears: 1,
    });
  });

  it('每點金額改成 null 時清空啟用時間與有效年限', async () => {
    await service.update({ amountPerPoint: 50, pointsValidityYears: 2 });

    await expect(
      service.update({ amountPerPoint: null }),
    ).resolves.toMatchObject({
      amountPerPoint: null,
      pointsEnabledAt: null,
      pointsValidityYears: null,
    });
  });

  it('付款時的訂單快照取全品牌設定', async () => {
    await service.update({ amountPerPoint: 25, pointsValidityYears: 3 });
    await client.exec(
      `insert into organization (id, name, slug, created_at) values ('org', 'biru', 'biru', now());
       insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, order_status)
       values ('o1', '{"name":"客人"}', 'pickup', '1', 'Cash', 'org', 100, 'OrderPaymentDue')`,
    );

    await db.update(order).set(POINTS_SNAPSHOT_SET).where(eq(order.id, 'o1'));

    expect(
      await db.query.order.findFirst({
        columns: { amountPerPoint: true, pointsValidityYears: true },
      }),
    ).toEqual({ amountPerPoint: '25.00', pointsValidityYears: 3 });
  });

  it('PATCH 寫入平台層的異動紀錄', async () => {
    const interceptor = new AuditInterceptor(
      new Reflector(),
      db as unknown as DrizzleDB,
    );
    const request = {
      body: { amountPerPoint: 40 },
      method: 'PATCH',
      params: {},
      user: { id: 'admin', name: '管理員', email: 'admin@example.com' },
    };
    const handler: unknown = Reflect.get(
      AdminPointSettingsController.prototype,
      'update',
    );
    const context = {
      getClass: () => AdminPointSettingsController,
      getHandler: () => handler,
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => from(service.update({ amountPerPoint: 40 })),
    };

    await lastValueFrom(interceptor.intercept(context, next));

    await vi.waitFor(async () =>
      expect(await db.select().from(auditLog)).toEqual([
        expect.objectContaining({
          action: 'update',
          organizationId: null,
          resource: 'pointSetting',
          resourceId: 'brand',
          changes: expect.objectContaining({
            amountPerPoint: { before: null, after: '40.00' },
          }),
        }),
      ]),
    );
  });
});
