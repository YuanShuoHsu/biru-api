import { readFileSync } from 'fs';

import type { PGlite } from '@electric-sql/pglite';
import type { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';

import * as schema from '../db/schema/index.js';
import {
  orderTicketJob,
  printer as printerTable,
} from '../db/schema/printers.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { PrintersService } from '../printers/printers.service.js';

import { OrderTicketService } from './order-ticket.service.js';

describe('OrderTicketService 出單機（PGlite）', () => {
  const ORG = 'org-1';

  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: OrderTicketService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new OrderTicketService(
      db as unknown as DrizzleDB,
      new EventEmitter2(),
      {
        t: (key: string, options?: { args?: Record<string, string> }) =>
          options?.args ? `${key} ${Object.values(options.args).join()}` : key,
      } as unknown as I18nService<I18nTranslations>,
      new PrintersService(
        db as unknown as DrizzleDB,
        {
          getOrThrow: () => 'http://api.test',
        } as unknown as ConfigService,
      ),
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate printer, organization cascade');
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
  });

  const printers = () =>
    db
      .select({ isDefault: printerTable.isDefault, name: printerTable.name })
      .from(printerTable)
      .where(eq(printerTable.organizationId, ORG))
      .orderBy(asc(printerTable.createdAt), asc(printerTable.id));

  it('一次新增多台時只有一台成為預設', async () => {
    await Promise.all(
      ['吧台', '廚房', '外帶'].map((name) =>
        service.createPrinter('biru', name),
      ),
    );

    const rows = await printers();
    expect(rows).toHaveLength(3);
    expect(rows.filter(({ isDefault }) => isDefault)).toHaveLength(1);
  });

  it('設為預設會取消原本的預設', async () => {
    await service.createPrinter('biru', '吧台');
    const kitchen = await service.createPrinter('biru', '廚房');

    await service.setDefaultPrinter('biru', kitchen.id);

    expect(await printers()).toEqual([
      { isDefault: false, name: '吧台' },
      { isDefault: true, name: '廚房' },
    ]);
  });

  it('移除預設的出單機並改設另一台為預設後，仍恰好一台是預設', async () => {
    const bar = await service.createPrinter('biru', '吧台');
    await service.createPrinter('biru', '廚房');
    const takeout = await service.createPrinter('biru', '外帶');

    await Promise.all([
      service.deletePrinter('biru', bar.id),
      service.setDefaultPrinter('biru', takeout.id),
    ]);

    const rows = await printers();
    expect(rows.map(({ name }) => name)).toEqual(['廚房', '外帶']);
    expect(rows.filter(({ isDefault }) => isDefault)).toHaveLength(1);
  });

  it('同店已有同名的出單機時拒絕新增', async () => {
    await service.createPrinter('biru', '吧台');

    await expect(service.createPrinter('biru', '吧台')).rejects.toMatchObject({
      response: { code: 'printerNameTaken' },
      status: 409,
    });
    expect(await printers()).toHaveLength(1);
  });

  it('不同店可以用同一個名稱', async () => {
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org-2', 'Biru 2', 'biru-2', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
    );
    await service.createPrinter('biru', '吧台');

    await expect(
      service.createPrinter('biru-2', '吧台'),
    ).resolves.toMatchObject({ name: '吧台' });
  });

  it('改名', async () => {
    const bar = await service.createPrinter('biru', '吧台');

    await expect(
      service.renamePrinter('biru', bar.id, '手搖吧台'),
    ).resolves.toMatchObject({ id: bar.id, isDefault: true, name: '手搖吧台' });
    expect(await printers()).toEqual([{ isDefault: true, name: '手搖吧台' }]);
  });

  it('改成同店另一台的名稱時拒絕', async () => {
    const bar = await service.createPrinter('biru', '吧台');
    await service.createPrinter('biru', '廚房');

    await expect(
      service.renamePrinter('biru', bar.id, '廚房'),
    ).rejects.toMatchObject({
      response: { code: 'printerNameTaken' },
      status: 409,
    });
    expect((await printers()).map(({ name }) => name)).toEqual([
      '吧台',
      '廚房',
    ]);
  });

  it('改名不存在或別店的出單機時回 404', async () => {
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ('org-2', 'Biru 2', 'biru-2', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
    );
    const elsewhere = await service.createPrinter('biru-2', '吧台');

    for (const printerId of [elsewhere.id, 'missing'])
      await expect(
        service.renamePrinter('biru', printerId, '廚房'),
      ).rejects.toMatchObject({
        response: { code: 'printerNotFound' },
        status: 404,
      });
  });

  it('共享點餐的品項在工作單印出點餐人暱稱', async () => {
    const bar = await service.createPrinter('biru', '吧台');
    await client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, order_status)
       values ('o1', '{"name":"王小明"}', 'counter', '1', 'Cash', $1, 200, 'OrderProcessing')`,
      [ORG],
    );
    await client.query(
      `insert into order_item (id, order_id, menu_item_id, menu_item_name, unit_price, order_quantity, participant_nickname)
       values ('shared', 'o1', 'm1', '{}', 100, 1, '小熊'), ('plain', 'o1', 'm1', '{}', 100, 1, null)`,
    );
    await db.transaction((tx) =>
      service.enqueueOrder(tx as unknown as DrizzleDB, 'o1', ORG),
    );

    const printer = await db.query.printer.findFirst({
      where: eq(printerTable.id, bar.id),
    });
    const [entry] = await service.poll(printer!);

    expect(
      entry.receipt.match(/common\.orderTickets\.participant 小熊/g),
    ).toHaveLength(1);
  });

  describe('自備環保杯的品項收杯後才出單', () => {
    const ownCup = JSON.stringify([
      {
        customerProvidedCup: true,
        modifierGroupId: 'sealing',
        modifierGroupName: '封口方式',
        modifierId: 'own-cup',
        modifierName: '自備環保杯',
        priceAdjustment: '-5.00',
      },
    ]);

    const insertItem = (
      id: string,
      {
        addOns = null,
        cupReceivedAt = null,
        modifiers = null,
      }: {
        addOns?: string | null;
        cupReceivedAt?: Date | null;
        modifiers?: string | null;
      } = {},
    ) =>
      client.query(
        `insert into order_item (id, order_id, menu_item_id, menu_item_name, unit_price, order_quantity, add_ons, modifiers, cup_received_at)
         values ($1, 'o1', 'm1', '{}', 100, 1, $2, $3, $4)`,
        [id, addOns, modifiers, cupReceivedAt],
      );

    const enqueuedItemIds = async () => {
      await db.transaction((tx) =>
        service.enqueueOrder(tx as unknown as DrizzleDB, 'o1', ORG),
      );
      const jobs = await db
        .select({ orderItemIds: orderTicketJob.orderItemIds })
        .from(orderTicketJob)
        .where(eq(orderTicketJob.orderId, 'o1'));
      return jobs.flatMap(({ orderItemIds }) => orderItemIds).sort();
    };

    beforeEach(async () => {
      await service.createPrinter('biru', '吧台');
      await client.query(
        `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, order_status)
         values ('o1', '{"name":"王小明"}', 'counter', '1', 'Cash', $1, 300, 'OrderProcessing')`,
        [ORG],
      );
    });

    it('還沒收杯的自備杯品項不出單，同張訂單其他品項照常出單', async () => {
      await insertItem('plain');
      await insertItem('own-cup', { modifiers: ownCup });
      await insertItem('own-cup-add-on', {
        addOns: JSON.stringify([
          {
            menuItemId: 'm2',
            menuItemName: '美式',
            modifiers: JSON.parse(ownCup),
            unitPrice: '60.00',
          },
        ]),
      });

      expect(await enqueuedItemIds()).toEqual(['plain']);
    });

    it('收杯後出單', async () => {
      await insertItem('own-cup', {
        cupReceivedAt: new Date(),
        modifiers: ownCup,
      });

      expect(await enqueuedItemIds()).toEqual(['own-cup']);
    });
  });

  describe('工作單標出每杯的封口', () => {
    const zhTW: unknown = JSON.parse(
      readFileSync('src/i18n/zh-TW/common.json', 'utf8'),
    );
    const translated = () =>
      new OrderTicketService(
        db as unknown as DrizzleDB,
        new EventEmitter2(),
        {
          t: (key: string) =>
            key
              .split('.')
              .slice(1)
              .reduce<unknown>(
                (value, part) => (value as Record<string, unknown>)[part],
                zhTW,
              ),
        } as unknown as I18nService<I18nTranslations>,
        new PrintersService(
          db as unknown as DrizzleDB,
          {
            getOrThrow: () => 'http://api.test',
          } as unknown as ConfigService,
        ),
      );

    const insertItem = (
      id: string,
      servingTemperatureLevel: string,
      cupSeal: string | null,
      {
        addOns = null,
        modifiers = null,
      }: { addOns?: object[] | null; modifiers?: object[] | null } = {},
    ) =>
      client.query(
        `insert into order_item (id, order_id, menu_item_id, menu_item_name, unit_price, order_quantity, serving_temperature_level, cup_seal, add_ons, modifiers)
         values ($1, 'o1', 'm1', $1, 100, 1, $2, $3, $4, $5)`,
        [
          id,
          servingTemperatureLevel,
          cupSeal,
          addOns && JSON.stringify(addOns),
          modifiers && JSON.stringify(modifiers),
        ],
      );

    const detailLines = async () => {
      const ticketService = translated();
      await ticketService.createPrinter('biru', '吧台');
      await db.transaction((tx) =>
        ticketService.enqueueOrder(tx as unknown as DrizzleDB, 'o1', ORG),
      );
      const [registered] = await db.select().from(printerTable);
      const [entry] = await ticketService.poll(registered);
      return [...entry.receipt.matchAll(/<text> {3}(.*?)&#10;<\/text>/g)]
        .map(([, detail]) => detail)
        .sort();
    };

    beforeEach(async () => {
      await client.query(
        `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, order_status)
         values ('o1', '{"name":"王小明"}', 'counter', '1', 'Cash', $1, 300, 'OrderProcessing')`,
        [ORG],
      );
    });

    it('沒選封口的外帶飲品印出預設封口，加購飲品也印', async () => {
      await insertItem('hot', 'Hot', 'film', {
        addOns: [
          {
            cupSeal: 'film',
            menuItemId: 'm2',
            menuItemName: '紅茶',
            modifiers: [],
            servingTemperatureLevel: 'NoIce',
            unitPrice: '30.00',
          },
        ],
      });
      await insertItem('iced', 'RegularIce', 'film');
      await insertItem('old', 'LessIce', null);

      expect(await detailLines()).toEqual([
        '+ 紅茶 / 去冰 / 封膜',
        '少冰',
        '正常冰 / 封膜',
        '熱 / 封膜',
      ]);
    });

    it('客人選了封口選項時只印選項名稱，不重複印封口', async () => {
      await insertItem('chosen', 'LessIce', 'lid', {
        modifiers: [
          {
            cupSeal: 'lid',
            modifierGroupId: 'sealing',
            modifierGroupName: '封口方式',
            modifierId: 'lid',
            modifierName: '加杯蓋',
            priceAdjustment: null,
          },
        ],
      });

      expect(await detailLines()).toEqual(['少冰 / 加杯蓋']);
    });

    it('門市沒有包材設定時存的是 null：沒選封口不印，選了沒標封口的選項只印選項名稱', async () => {
      await insertItem('unchosen', 'RegularIce', null);
      await insertItem('untagged', 'LessIce', null, {
        modifiers: [
          {
            modifierGroupId: 'sealing',
            modifierGroupName: '封口方式',
            modifierId: 'lid',
            modifierName: '杯蓋',
            priceAdjustment: null,
          },
        ],
      });

      expect(await detailLines()).toEqual(['少冰 / 杯蓋', '正常冰']);
    });
  });
});
