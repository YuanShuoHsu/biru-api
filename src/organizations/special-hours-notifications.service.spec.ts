import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import { DAY_MS, platformDateString } from '../common/constants/timezone.js';
import * as schema from '../db/schema/index.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import {
  REFUND_SETTLED_EVENT,
  type RefundSettledEvent,
} from '../events/refund-settled.event.js';
import { MailsService } from '../mails/mails.service.js';

import { SpecialHoursNotificationsService } from './special-hours-notifications.service.js';

const day = (offset: number) =>
  platformDateString(new Date(Date.now() + offset * DAY_MS));
const pickupTime = () => new Date(`${day(2)}T12:00:00+08:00`);

describe('SpecialHoursNotificationsService', () => {
  let client: PGlite;
  let module: TestingModule;
  let eventEmitter: EventEmitter2;
  const sendOrderStoreClosed = vi.fn();

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        SpecialHoursNotificationsService,
        { provide: DRIZZLE, useValue: db },
        { provide: MailsService, useValue: { sendOrderStoreClosed } },
      ],
    }).compile();
    await module.init();
    eventEmitter = module.get(EventEmitter2);
  }, 60_000);

  afterAll(async () => {
    await module.close();
    await client.close();
  });

  beforeEach(async () => {
    sendOrderStoreClosed.mockReset();
    await client.exec(`
      truncate organization, "user" cascade;
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address)
      values ('biru', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段');
      insert into organization_special_hours (id, organization_id, valid_from, valid_through, opening_hours, note)
      values ('closed', 'biru', '${day(2)}', '${day(2)}', null, '颱風停業');
      insert into "user" (id, name, first_name, email, lang, email_verified)
      values ('amy', 'Amy', 'Amy', 'amy@example.com', 'ja', true);
    `);
    await client.query(
      `insert into "order" (id, customer, mode, order_number, payment_method, order_status, payment_date, seller_id, subtotal, pickup_time, user_id)
       values ('card', '{"name":"Amy","email":"amy@example.com"}', 'pickup', 'card', 'Credit', 'OrderReturned', now(), 'biru', 100, $1, 'amy')`,
      [pickupTime().toISOString()],
    );
    await client.exec(`
      insert into refund (id, order_id, amount, scope, channel, status, reason_code)
      values ('r', 'card', 100, 'full', 'ecpay', 'settled', 'storeClosed')
    `);
  });

  it('因公休的退款完成時寄一封信給訂購人', async () => {
    eventEmitter.emit(REFUND_SETTLED_EVENT, {
      orderId: 'card',
      organizationId: 'biru',
      reasonCode: 'storeClosed',
      refundId: 'r',
    } satisfies RefundSettledEvent);

    await vi.waitFor(() => expect(sendOrderStoreClosed).toHaveBeenCalled());
    expect(sendOrderStoreClosed).toHaveBeenCalledExactlyOnceWith({
      amount: '100.00',
      email: 'amy@example.com',
      lang: 'ja',
      note: '颱風停業',
      orderNumber: 'card',
      organizationName: 'Biru',
      pickupTime: pickupTime(),
    });
  });

  it('不是因公休的退款或訂單沒有 email 時不寄信', async () => {
    await eventEmitter.emitAsync(REFUND_SETTLED_EVENT, {
      orderId: 'card',
      organizationId: 'biru',
      reasonCode: 'wrongItem',
      refundId: 'r',
    } satisfies RefundSettledEvent);
    await client.exec(
      `update "order" set customer = '{"name":"Amy"}' where id = 'card'`,
    );
    await module.get(SpecialHoursNotificationsService).onRefundSettled({
      orderId: 'card',
      organizationId: 'biru',
      reasonCode: 'storeClosed',
      refundId: 'r',
    });

    expect(sendOrderStoreClosed).not.toHaveBeenCalled();
  });
});
