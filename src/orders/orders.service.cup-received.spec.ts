import type { PGlite } from '@electric-sql/pglite';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { ORDER_UPDATED_EVENT } from '../events/order-updated.event.js';

import { OrdersService } from './orders.service.js';

const ownCupModifiers = [
  {
    customerProvidedCup: true,
    modifierGroupId: 'seal',
    modifierGroupName: '封口方式',
    modifierId: 'own-cup',
    modifierName: '自備環保杯',
    priceAdjustment: '-5.00',
  },
];

const OWN_CUP = JSON.stringify(ownCupModifiers);

const OWN_CUP_ADD_ON = JSON.stringify([
  {
    menuItemId: 'm1',
    menuItemName: '拿鐵',
    modifiers: ownCupModifiers,
    unitPrice: '95.00',
  },
]);

describe('OrdersService.receiveOrderItemCup', () => {
  let client: PGlite;
  let emit: ReturnType<typeof vi.spyOn>;
  let enqueueOrder: ReturnType<typeof vi.fn>;
  let service: OrdersService;

  const cupReceivedAtOf = async (orderItemId: string) =>
    (
      await client.query<{ cup_received_at: Date | null }>(
        'select cup_received_at from order_item where id = $1',
        [orderItemId],
      )
    ).rows[0].cup_received_at;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    const eventEmitter = new EventEmitter2();
    emit = vi.spyOn(eventEmitter, 'emit');
    enqueueOrder = vi.fn().mockResolvedValue([]);
    service = new OrdersService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { enqueueOrder } as never,
      eventEmitter,
      {} as never,
      {} as never,
      {} as never,
    );

    await client.exec(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
         ('org', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
         ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段');
       insert into "order" (id, customer, mode, order_number, order_status, payment_method, confirmation_number, seller_id, subtotal, created_at) values
         ('processing', '{"name":"客人"}', 'counter', '1', 'OrderProcessing', 'Cash', 'c1', 'org', 290, now()),
         ('due', '{"name":"客人"}', 'counter', '2', 'OrderPaymentDue', 'Cash', 'c2', 'org', 95, now()),
         ('elsewhere', '{"name":"客人"}', 'counter', '3', 'OrderProcessing', 'Cash', 'c3', 'other', 95, now()),
         ('refunded', '{"name":"客人"}', 'counter', '4', 'OrderProcessing', 'Credit', 'c4', 'org', 95, now());
       insert into order_item (id, order_id, menu_item_id, menu_item_name, order_quantity, unit_price, modifiers, add_ons) values
         ('own-cup', 'processing', 'm1', '拿鐵', 1, 95, '${OWN_CUP}', null),
         ('add-on-cup', 'processing', 'm2', '蛋糕', 1, 195, null, '${OWN_CUP_ADD_ON}'),
         ('glass', 'processing', 'm1', '拿鐵', 1, 100, null, null),
         ('unpaid-cup', 'due', 'm1', '拿鐵', 1, 95, '${OWN_CUP}', null),
         ('foreign-cup', 'elsewhere', 'm1', '拿鐵', 1, 95, '${OWN_CUP}', null),
         ('refunded-cup', 'refunded', 'm1', '拿鐵', 1, 95, '${OWN_CUP}', null);
       insert into refund (id, order_id, amount, scope, channel, items, status) values
         ('no-cup', 'refunded', 95, 'partial', 'manual', '[{"orderItemId":"refunded-cup","quantity":1,"amount":"95","menuItemName":"拿鐵","unitPrice":"95"}]', 'refunded');`,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    emit.mockClear();
    enqueueOrder.mockClear();
  });

  it('記下收杯時間、只把這杯排進工作單，並通知看板', async () => {
    await expect(
      service.receiveOrderItemCup('biru', 'processing', 'own-cup'),
    ).resolves.toMatchObject({
      id: 'own-cup',
      cupReceivedAt: expect.any(Date),
    });

    expect(await cupReceivedAtOf('own-cup')).toBeInstanceOf(Date);
    expect(await cupReceivedAtOf('add-on-cup')).toBeNull();
    expect(enqueueOrder).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      'processing',
      'org',
      ['own-cup'],
    );
    expect(emit).toHaveBeenCalledWith(ORDER_UPDATED_EVENT, {
      orderId: 'processing',
      organizationId: 'org',
    });
  });

  it('加購項選了自備杯的品項也可收杯', async () => {
    await expect(
      service.receiveOrderItemCup('biru', 'processing', 'add-on-cup'),
    ).resolves.toMatchObject({ cupReceivedAt: expect.any(Date) });
  });

  it('重複收杯時拒絕，不再排單也不改時間', async () => {
    const first = await cupReceivedAtOf('own-cup');

    await expect(
      service.receiveOrderItemCup('biru', 'processing', 'own-cup'),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'cupAlreadyReceived' },
    });
    expect(await cupReceivedAtOf('own-cup')).toEqual(first);
    expect(enqueueOrder).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('不是自備杯的品項拒絕', async () => {
    await expect(
      service.receiveOrderItemCup('biru', 'processing', 'glass'),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'notOwnCupItem' },
    });
    expect(await cupReceivedAtOf('glass')).toBeNull();
    expect(enqueueOrder).not.toHaveBeenCalled();
  });

  it('訂單不屬於這家店時回 404', async () => {
    await expect(
      service.receiveOrderItemCup('biru', 'elsewhere', 'foreign-cup'),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'orderNotFound' },
    });
    expect(await cupReceivedAtOf('foreign-cup')).toBeNull();
  });

  it('品項不屬於這張訂單時回 404', async () => {
    await expect(
      service.receiveOrderItemCup('biru', 'processing', 'unpaid-cup'),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'orderItemNotFound' },
    });
  });

  it('訂單還沒付款時拒絕', async () => {
    await expect(
      service.receiveOrderItemCup('biru', 'due', 'unpaid-cup'),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'statusChanged' },
    });
    expect(await cupReceivedAtOf('unpaid-cup')).toBeNull();
  });

  it('已全數退款的品項拒絕', async () => {
    await expect(
      service.receiveOrderItemCup('biru', 'refunded', 'refunded-cup'),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'orderItemRefunded' },
    });
    expect(await cupReceivedAtOf('refunded-cup')).toBeNull();
    expect(enqueueOrder).not.toHaveBeenCalled();
  });
});
