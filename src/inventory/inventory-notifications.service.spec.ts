import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';
import { ingredient, supplier } from '../db/schema/inventory.js';
import { member } from '../db/schema/organizations.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { MailsService } from '../mails/mails.service.js';

import { InventoryNotificationsService } from './inventory-notifications.service.js';

describe('InventoryNotificationsService.notifyLowStockDigest', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const sendLowStockDigest = vi.fn();
  let service: InventoryNotificationsService;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new InventoryNotificationsService(
      db as unknown as DrizzleDB,
      {
        sendLowStockDigest,
      } as unknown as MailsService,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    sendLowStockDigest.mockReset().mockResolvedValue(undefined);
    await client.exec(
      'truncate ingredient, supplier, organization, "user" cascade',
    );
    for (const [id, slug] of [
      ['org', 'biru'],
      ['other', 'other'],
    ])
      await client.query(
        `insert into organization (id, name, slug, created_at) values ($1, $2, $2, now())`,
        [id, slug],
      );
    for (const [id, lang] of [
      ['owner', 'en'],
      ['admin', 'zh-TW'],
      ['staff', 'zh-TW'],
      ['otherOwner', 'zh-TW'],
    ])
      await client.query(
        `insert into "user" (id, name, email, first_name, lang) values ($1, $1, $1 || '@example.com', $1, $2)`,
        [id, lang],
      );
    await db.insert(member).values([
      {
        id: 'm1',
        organizationId: 'org',
        userId: 'owner',
        role: 'owner',
        createdAt: new Date(),
      },
      {
        id: 'm2',
        organizationId: 'org',
        userId: 'admin',
        role: 'admin',
        createdAt: new Date(),
      },
      {
        id: 'm3',
        organizationId: 'org',
        userId: 'staff',
        role: 'member',
        createdAt: new Date(),
      },
      {
        id: 'm4',
        organizationId: 'other',
        userId: 'otherOwner',
        role: 'owner',
        createdAt: new Date(),
      },
    ]);
    await db
      .insert(supplier)
      .values({ id: 'dairy', name: '鮮乳坊', organizationId: 'org' });
    await db.insert(ingredient).values(
      [
        {
          id: 'milk',
          inventoryLevel: '100',
          lowStockThreshold: '500',
          supplierId: 'dairy',
        },
        {
          id: 'oat',
          inventoryLevel: '500',
          lowStockThreshold: '500',
          supplierId: null,
        },
        {
          id: 'beans',
          inventoryLevel: '900',
          lowStockThreshold: '500',
          supplierId: null,
        },
        {
          id: 'cups',
          inventoryLevel: '0',
          lowStockThreshold: null,
          supplierId: null,
        },
      ].map((row, index) => ({
        ...row,
        name: { en: `${row.id} (en)`, 'zh-TW': row.id },
        organizationId: 'org',
        sortOrder: index,
        unitCode: 'MLT' as const,
      })),
    );
    await db.insert(ingredient).values({
      id: 'otherBeans',
      inventoryLevel: '100',
      lowStockThreshold: '500',
      name: { 'zh-TW': 'otherBeans' },
      organizationId: 'other',
      unitCode: 'GRM',
    });
  });

  it('只寄給有低庫存食材門市的 owner／admin，內容只含該門市跌到門檻以下的食材', async () => {
    const notified = await service.notifyLowStockDigest();

    expect(notified).toBe(3);
    expect(
      sendLowStockDigest.mock.calls.map(([{ recipient }]) => recipient.email),
    ).toEqual(
      expect.arrayContaining(['owner@example.com', 'admin@example.com']),
    );

    const toOwner = sendLowStockDigest.mock.calls.find(
      ([{ recipient }]) => recipient.email === 'owner@example.com',
    )![0];
    expect(toOwner.path).toBe(
      '/inventory/ingredients?organization=biru&lowStock=true',
    );
    expect(toOwner.ingredients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'milk (en)', supplierName: '鮮乳坊' }),
        expect.objectContaining({ name: 'oat (en)', supplierName: null }),
      ]),
    );
    expect(toOwner.ingredients).toHaveLength(2);

    const toOtherOwner = sendLowStockDigest.mock.calls.find(
      ([{ recipient }]) => recipient.email === 'otherOwner@example.com',
    )![0];
    expect(toOtherOwner.ingredients).toEqual([
      expect.objectContaining({ name: 'otherBeans' }),
    ]);
  });

  it('沒有低庫存食材時不寄信', async () => {
    await client.exec(`update ingredient set inventory_level = 1000`);

    expect(await service.notifyLowStockDigest()).toBe(0);
    expect(sendLowStockDigest).not.toHaveBeenCalled();
  });

  it('單一收件人寄送失敗時繼續寄給其他人', async () => {
    sendLowStockDigest.mockRejectedValueOnce(new Error('smtp'));

    expect(await service.notifyLowStockDigest()).toBe(2);
    expect(sendLowStockDigest).toHaveBeenCalledTimes(3);
  });
});
