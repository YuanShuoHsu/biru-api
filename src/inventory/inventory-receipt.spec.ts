import { HttpException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { InventoryTransactionsService } from './inventory-transactions.service.js';

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
  let service: InventoryTransactionsService;

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    service = new InventoryTransactionsService(
      pglite as unknown as DrizzleDB,
      new EventEmitter2(),
    );
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

    expect(receipt.supplierId).toBeNull();
    expect(receipt.receivedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(receipt.inventoryTransactions[0]).not.toHaveProperty('unitCost');
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
