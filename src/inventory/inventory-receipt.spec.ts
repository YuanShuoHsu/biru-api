import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { from, lastValueFrom } from 'rxjs';

import { createPGlite } from '../../test/pglite.js';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor.js';
import { auditLog } from '../db/schema/audit.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { InventoryTransactionsService } from './inventory-transactions.service.js';
import { OrganizationInventoryController } from './organization-inventory.controller.js';

const ORG = 'org';
const OTHER_ORG = 'other';

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return ((error as HttpException).getResponse() as { code: string }).code;
  }

  throw new Error('expected a rejection');
};

describe('進貨點收', () => {
  let client: PGlite;
  let db: DrizzleDB;
  let service: InventoryTransactionsService;

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as DrizzleDB;
    service = new InventoryTransactionsService(db, new EventEmitter2());
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate "user", organization cascade');
    for (const id of [ORG, OTHER_ORG])
      await client.exec(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('${id}', '${id}', '${id}', now(), 'TW', '桃園市', '大園區', '中正東路一段');
         insert into supplier (id, organization_id, name) values ('${id}-farm', '${id}', '牧場');`,
      );
    await client.exec(
      `insert into "user" (id, name, first_name, email, lang) values ('staff', 'Staff', 'Staff', 'staff@example.com', 'zh-TW');
       insert into ingredient (id, organization_id, name, unit_code, inventory_level, eligible_quantity, eligible_quantity_unit_code, price) values
         ('milk', '${ORG}', '{"zh-TW":"milk"}', 'MLT', 100, 2, 'LTR', 200),
         ('ice', '${ORG}', '{"zh-TW":"ice"}', 'GRM', 0, null, null, null),
         ('other-milk', '${OTHER_ORG}', '{"zh-TW":"milk"}', 'MLT', 0, 2, 'LTR', 200);
       insert into inventory_transaction (id, ingredient_id, organization_id, quantity) values ('opening', 'milk', '${ORG}', 100);`,
    );
  });

  const levels = async () =>
    Object.fromEntries(
      (
        await client.query<{ id: string; inventory_level: string }>(
          `select id, inventory_level from ingredient where organization_id = '${ORG}' order by id`,
        )
      ).rows.map(({ id, inventory_level }) => [id, Number(inventory_level)]),
    );

  const receiptCount = async () =>
    (
      await client.query<{ count: number }>(
        'select count(*)::int as count from inventory_receipt',
      )
    ).rows[0].count;

  it('包裝數依規格換算成庫存數量，進價由食材規格推算，整張記在同一張進貨單', async () => {
    const receipt = await service.receive(
      ORG,
      {
        supplierId: `${ORG}-farm`,
        receivedAt: '2026-11-20T08:00:00+08:00',
        note: '週五到貨',
        items: [
          { ingredientId: 'milk', packages: '1.5' },
          { ingredientId: 'ice', quantity: '5000' },
        ],
      },
      null,
      true,
      'staff',
    );

    expect(await levels()).toEqual({ ice: 5000, milk: 3100 });
    expect(receipt).toMatchObject({
      createdBy: 'staff',
      note: '週五到貨',
      organizationId: ORG,
      supplierId: `${ORG}-farm`,
    });
    expect(receipt.receivedAt.toISOString()).toBe('2026-11-20T00:00:00.000Z');
    expect(
      receipt.inventoryTransactions
        .map(
          ({
            balance,
            createdBy,
            ingredientId,
            quantity,
            reason,
            receiptId,
            unitCost,
          }) => ({
            balance,
            createdBy,
            ingredientId,
            quantity,
            reason,
            receiptId,
            unitCost: unitCost && Number(unitCost),
          }),
        )
        .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId)),
    ).toEqual([
      {
        balance: '5000.000',
        createdBy: 'staff',
        ingredientId: 'ice',
        quantity: '5000.000',
        reason: 'receive',
        receiptId: receipt.id,
        unitCost: null,
      },
      {
        balance: '3100.000',
        createdBy: 'staff',
        ingredientId: 'milk',
        quantity: '3000.000',
        reason: 'receive',
        receiptId: receipt.id,
        unitCost: 0.1,
      },
    ]);

    const { data } = await service.findAll('milk');
    expect(data[0]).toMatchObject({ reason: 'receive', receiptId: receipt.id });
  });

  it('省略到貨時間時記為送出當下；沒有採購權限時不回傳進價', async () => {
    const before = Date.now();
    const receipt = await service.receive(
      ORG,
      { items: [{ ingredientId: 'milk', quantity: '10' }] },
      null,
      false,
    );

    expect(receipt.receivedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(receipt.inventoryTransactions[0]).not.toHaveProperty('unitCost');
  });

  it('供應商依當次呼叫者的採購權限回傳，重送時也一樣', async () => {
    const dto = {
      supplierId: `${ORG}-farm`,
      items: [{ ingredientId: 'milk', quantity: '10' }],
    };

    const first = await service.receive(ORG, dto, 'key-x', true);
    const replayed = await service.receive(ORG, dto, 'key-x', false);

    expect(first.supplierId).toBe(`${ORG}-farm`);
    expect(replayed.id).toBe(first.id);
    expect(replayed.supplierId).toBeUndefined();
    expect(replayed.inventoryTransactions[0]).not.toHaveProperty('unitCost');
  });

  it.each([
    [
      'receiptPackageMissing',
      [
        { ingredientId: 'milk', packages: '1' },
        { ingredientId: 'ice', packages: '1' },
      ],
    ],
    [
      'receiptQuantityRequired',
      [{ ingredientId: 'milk', packages: '1', quantity: '2000' }],
    ],
    ['receiptQuantityRequired', [{ ingredientId: 'milk' }]],
    [
      'ingredientNotFound',
      [
        { ingredientId: 'milk', packages: '1' },
        { ingredientId: 'other-milk', packages: '1' },
      ],
    ],
  ])('%s：任何一項失敗整張都不寫入', async (code, items) => {
    expect(await codeOf(service.receive(ORG, { items }, null))).toBe(code);

    expect(await levels()).toEqual({ ice: 0, milk: 100 });
    expect(await receiptCount()).toBe(0);
  });

  it('自製的食材要用製作批次入庫，不能點收進貨', async () => {
    await client.exec(
      `insert into recipe (id, organization_id, name, recipe_yield_quantity, recipe_yield_unit_code) values ('syrup-recipe', '${ORG}', '{"zh-TW":"syrup"}', 1000, 'MLT');
       insert into ingredient (id, organization_id, name, unit_code, recipe_id) values ('syrup', '${ORG}', '{"zh-TW":"syrup"}', 'MLT', 'syrup-recipe');`,
    );

    expect(
      await codeOf(
        service.receive(
          ORG,
          {
            items: [
              { ingredientId: 'milk', packages: '1' },
              { ingredientId: 'syrup', quantity: '500' },
            ],
          },
          null,
        ),
      ),
    ).toBe('receiptSourcedIngredient');
    expect(await levels()).toEqual({ ice: 0, milk: 100, syrup: 0 });
    expect(await receiptCount()).toBe(0);
  });

  it('每項點收的食材各記一筆異動紀錄', async () => {
    const dto = {
      items: [
        { ingredientId: 'milk', quantity: '10' },
        { ingredientId: 'ice', quantity: '500' },
      ],
    };
    const request = {
      body: dto,
      method: 'POST',
      organizationId: ORG,
      params: { organizationSlug: ORG },
      user: { id: 'staff', name: 'Staff', email: 'staff@example.com' },
    };
    const handler: unknown = Reflect.get(
      OrganizationInventoryController.prototype,
      'createInventoryReceipt',
    );
    const context = {
      getClass: () => OrganizationInventoryController,
      getHandler: () => handler,
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => from(service.receive(ORG, dto, null, true, 'staff')),
    };

    await lastValueFrom(
      new AuditInterceptor(new Reflector(), db).intercept(context, next),
    );

    await vi.waitFor(async () =>
      expect(
        (await db.select().from(auditLog)).sort((a, b) =>
          a.resourceId.localeCompare(b.resourceId),
        ),
      ).toEqual([
        expect.objectContaining({
          action: 'update',
          actorId: 'staff',
          organizationId: ORG,
          resource: 'ingredient',
          resourceId: 'ice',
          changes: expect.objectContaining({
            inventoryLevel: { before: '0.000', after: '500.000' },
          }),
        }),
        expect.objectContaining({
          action: 'update',
          actorId: 'staff',
          organizationId: ORG,
          resource: 'ingredient',
          resourceId: 'milk',
          changes: expect.objectContaining({
            inventoryLevel: { before: '100.000', after: '110.000' },
          }),
        }),
      ]),
    );
  });

  it('其他門市的供應商視為不存在', async () => {
    expect(
      await codeOf(
        service.receive(
          ORG,
          {
            supplierId: `${OTHER_ORG}-farm`,
            items: [{ ingredientId: 'milk', packages: '1' }],
          },
          null,
        ),
      ),
    ).toBe('supplierNotFound');
    expect(await receiptCount()).toBe(0);
  });

  it('同一把 Idempotency-Key 重送回傳原進貨單，不再入庫；內容不同則拒絕', async () => {
    const dto = { items: [{ ingredientId: 'milk', packages: '1' }] };
    const first = await service.receive(ORG, dto, 'key-1', true, 'staff');
    const replayed = await service.receive(ORG, dto, 'key-1', true, 'staff');

    expect(replayed).toEqual(first);
    expect(await levels()).toEqual({ ice: 0, milk: 2100 });
    expect(
      await codeOf(
        service.receive(
          ORG,
          { items: [{ ingredientId: 'milk', packages: '2' }] },
          'key-1',
        ),
      ),
    ).toBe('idempotencyConflict');

    await service.receive(
      OTHER_ORG,
      {
        items: [{ ingredientId: 'other-milk', packages: '1' }],
      },
      'key-1',
    );
    expect(await receiptCount()).toBe(2);
  });

  it('同時送出同一把鍵只入庫一次', async () => {
    const dto = { items: [{ ingredientId: 'milk', packages: '1' }] };
    const [a, b] = await Promise.all([
      service.receive(ORG, dto, 'key-2'),
      service.receive(ORG, dto, 'key-2'),
    ]);

    expect(a.id).toBe(b.id);
    expect(await levels()).toEqual({ ice: 0, milk: 2100 });
  });
});
