import type { PGlite } from '@electric-sql/pglite';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { ORDER_UPDATED_EVENT } from '../events/order-updated.event.js';

import { OrdersService } from './orders.service.js';

describe('OrdersService.setOrderItemPrepared', () => {
  let client: PGlite;
  let emit: ReturnType<typeof vi.spyOn>;
  let service: OrdersService;

  const preparedAtOf = async (orderItemId: string) =>
    (
      await client.query<{ prepared_at: Date | null }>(
        'select prepared_at from order_item where id = $1',
        [orderItemId],
      )
    ).rows[0].prepared_at;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    const eventEmitter = new EventEmitter2();
    emit = vi.spyOn(eventEmitter, 'emit');
    service = new OrdersService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
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
         ('processing', '{"name":"客人"}', 'counter', '1', 'OrderProcessing', 'Cash', 'c1', 'org', 100, now()),
         ('ready', '{"name":"客人"}', 'counter', '2', 'OrderPickupAvailable', 'Cash', 'c2', 'org', 100, now()),
         ('elsewhere', '{"name":"客人"}', 'counter', '3', 'OrderProcessing', 'Cash', 'c3', 'other', 100, now());
       insert into order_item (id, order_id, menu_item_id, menu_item_name, order_quantity, unit_price) values
         ('latte', 'processing', 'm1', '拿鐵', 1, 100),
         ('mocha', 'processing', 'm2', '摩卡', 1, 100),
         ('served', 'ready', 'm1', '拿鐵', 1, 100),
         ('foreign', 'elsewhere', 'm1', '拿鐵', 1, 100);`,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    emit.mockClear();
  });

  it('標記完成後記下時間，重複標記保留第一次的時間，取消後清空', async () => {
    const marked = await service.setOrderItemPrepared(
      'biru',
      'processing',
      'latte',
      true,
    );
    expect(marked).toMatchObject({ id: 'latte', preparedAt: expect.any(Date) });
    const first = await preparedAtOf('latte');
    expect(first).toBeInstanceOf(Date);

    await service.setOrderItemPrepared('biru', 'processing', 'latte', true);
    expect(await preparedAtOf('latte')).toEqual(first);
    expect(await preparedAtOf('mocha')).toBeNull();

    await expect(
      service.setOrderItemPrepared('biru', 'processing', 'latte', false),
    ).resolves.toMatchObject({ id: 'latte', preparedAt: null });
    expect(await preparedAtOf('latte')).toBeNull();
  });

  it('每次變更都通知店員看板', async () => {
    await service.setOrderItemPrepared('biru', 'processing', 'mocha', true);

    expect(emit).toHaveBeenCalledWith(ORDER_UPDATED_EVENT, {
      orderId: 'processing',
      organizationId: 'org',
    });
  });

  it('訂單不在製作中時拒絕', async () => {
    await expect(
      service.setOrderItemPrepared('biru', 'ready', 'served', true),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'statusChanged' },
    });
    expect(await preparedAtOf('served')).toBeNull();
    expect(emit).not.toHaveBeenCalled();
  });

  it('品項不屬於這張訂單時回 404', async () => {
    await expect(
      service.setOrderItemPrepared('biru', 'processing', 'served', true),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'orderItemNotFound' },
    });
    expect(await preparedAtOf('served')).toBeNull();
    expect(emit).not.toHaveBeenCalled();
  });

  it('訂單不屬於這家店時回 404', async () => {
    await expect(
      service.setOrderItemPrepared('biru', 'elsewhere', 'foreign', true),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'orderNotFound' },
    });
    expect(await preparedAtOf('foreign')).toBeNull();
  });
});
