import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import { DAY_MS, platformDateString } from '../common/constants/timezone.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { EcpayOrderRefundService } from '../ecpay/services/ecpay-order-refund.service.js';
import type { MailsService } from '../mails/mails.service.js';
import type { OrderQrService } from '../orders/order-qr.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import { WaitlistService } from '../waitlist/waitlist.service.js';

import { SpecialHoursService } from './special-hours.service.js';

const day = (offset: number) =>
  platformDateString(new Date(Date.now() + offset * DAY_MS));

describe('SpecialHoursService', () => {
  let client: PGlite;
  let service: SpecialHoursService;
  let waitlistService: WaitlistService;
  const applyTransitions = vi.fn();
  const refundOrder = vi.fn();
  const sendOrderStoreClosed = vi.fn();

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema }) as unknown as DrizzleDB;
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new SpecialHoursService(
      db,
      { sendOrderStoreClosed } as unknown as MailsService,
      { applyTransitions } as unknown as OrdersService,
      { refundOrder } as unknown as EcpayOrderRefundService,
      (waitlistService = new WaitlistService(
        db,
        new EventEmitter2(),
        {} as OrderQrService,
      )),
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(`
      truncate organization cascade;
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
        ('biru', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
        ('cafe', 'Cafe', 'cafe', now(), 'TW', '桃園市', '大園區', '中正東路一段');
    `);
  });

  it('新增後列出今天以後的特殊營業日，已結束的不列', async () => {
    await client.exec(`
      insert into organization_special_hours (id, organization_id, valid_from, valid_through)
      values ('past', 'biru', '${day(-3)}', '${day(-1)}')
    `);

    const created = await service.create('biru', {
      validFrom: day(0),
      validThrough: day(2),
      openingHours: null,
      note: '颱風停業',
    });

    expect(created).toMatchObject({
      organizationId: 'biru',
      validFrom: day(0),
      validThrough: day(2),
      openingHours: null,
      note: '颱風停業',
    });
    await expect(service.findUpcoming('biru')).resolves.toEqual([created]);
  });

  it('和既有區間重疊時回 409 並附上衝突那筆', async () => {
    const existing = await service.create('biru', {
      validFrom: day(5),
      validThrough: day(7),
      openingHours: 'Mo-Su 10:00-15:00',
    });

    const error = await service
      .create('biru', {
        validFrom: day(7),
        validThrough: day(9),
        openingHours: null,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'specialHoursOverlap',
      conflict: existing,
    });
  });

  it('更新成和另一筆重疊時回 409，只改自己時不算重疊', async () => {
    const first = await service.create('biru', {
      validFrom: day(1),
      validThrough: day(2),
      openingHours: null,
    });
    const second = await service.create('biru', {
      validFrom: day(4),
      validThrough: day(5),
      openingHours: null,
    });

    await expect(
      service.update('biru', second.id, { validFrom: day(2) }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.update('biru', first.id, { validThrough: day(3), note: '延長' }),
    ).resolves.toMatchObject({ validThrough: day(3), note: '延長' });
  });

  it('不能新增或改成已結束的區間，也不能讓開始晚於結束', async () => {
    await expect(
      service.create('biru', {
        validFrom: day(-2),
        validThrough: day(-1),
        openingHours: null,
      }),
    ).rejects.toMatchObject({ response: { code: 'specialHoursEnded' } });
    await expect(
      service.create('biru', {
        validFrom: day(3),
        validThrough: day(2),
        openingHours: null,
      }),
    ).rejects.toMatchObject({ response: { code: 'specialHoursInvalidRange' } });

    const created = await service.create('biru', {
      validFrom: day(0),
      validThrough: day(1),
      openingHours: null,
    });
    await expect(
      service.update('biru', created.id, {
        validFrom: day(-2),
        validThrough: day(-1),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('區間最長一年，到隔年同一天就回 400 並帶 specialHoursTooLong', async () => {
    const create = (validFrom: string, validThrough: string) =>
      service.create('biru', {
        validFrom,
        validThrough,
        openingHours: 'Mo-Su',
      });

    await expect(create('2099-03-01', '2100-03-01')).rejects.toMatchObject({
      status: 400,
      response: { code: 'specialHoursTooLong' },
    });
    await expect(create('2099-03-01', '2100-02-28')).resolves.toBeDefined();
    await expect(create('2096-01-01', '2096-12-31')).resolves.toBeDefined();

    const created = await create('2097-01-01', '2097-01-02');
    await expect(
      service.update('biru', created.id, { validThrough: '2098-01-01' }),
    ).rejects.toMatchObject({ response: { code: 'specialHoursTooLong' } });
  });

  it('刪除後不再列出，刪除時留下可追溯的紀錄', async () => {
    const created = await service.create('biru', {
      validFrom: day(1),
      validThrough: day(1),
      openingHours: null,
    });

    await service.remove('biru', created.id);

    await expect(service.findUpcoming('biru')).resolves.toEqual([]);
    const { rows } = await client.query(
      `select 1 from deleted_record where table_name = 'organization_special_hours'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('不同門市的區間互不影響，也不能用別家門市改或刪', async () => {
    const biru = await service.create('biru', {
      validFrom: day(1),
      validThrough: day(3),
      openingHours: null,
    });
    await expect(
      service.create('cafe', {
        validFrom: day(1),
        validThrough: day(3),
        openingHours: null,
      }),
    ).resolves.toMatchObject({ organizationId: 'cafe' });

    await expect(service.findUpcoming('cafe')).resolves.toHaveLength(1);
    await expect(
      service.update('cafe', biru.id, { note: '改別家' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('cafe', biru.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.findUpcoming('biru')).resolves.toEqual([biru]);
  });

  it('改或刪不存在的特殊營業日時回 404 並帶 specialHoursNotFound', async () => {
    const missing = {
      status: 404,
      response: { code: 'specialHoursNotFound' },
    };
    await expect(
      service.update('biru', crypto.randomUUID(), { note: '不存在' }),
    ).rejects.toMatchObject(missing);
    await expect(
      service.remove('biru', crypto.randomUUID()),
    ).rejects.toMatchObject(missing);
  });

  describe('findAffected', () => {
    const all = { orders: true, waitlist: true };
    const at = (offset: number, time: string) =>
      `${day(offset)}T${time}:00+08:00`;

    const insertOrder = (
      id: string,
      pickupTime: string,
      paymentMethod = 'Credit',
      orderStatus = 'OrderProcessing',
    ) =>
      client.query(
        `insert into "order" (id, customer, mode, order_number, payment_method, order_status, payment_date, seller_id, subtotal, pickup_time)
         values ($1, '{"name":"王小明"}', 'pickup', $1, $2, $3, $4, 'biru', 100, $5)`,
        [
          id,
          paymentMethod,
          orderStatus,
          orderStatus === 'OrderPaymentDue' ? null : new Date().toISOString(),
          new Date(pickupTime).toISOString(),
        ],
      );

    const ids = (orders?: { id: string }[]) => orders?.map(({ id }) => id);

    beforeEach(async () => {
      await client.exec(
        `update organization set opening_hours = 'Mo-Su 08:00-20:00', pickup_cutoff_minutes = 15 where id = 'biru'`,
      );
    });

    it('依付款狀態與退款方式分類受特殊營業日影響的自取訂單', async () => {
      await client.exec(`
        insert into organization_special_hours (id, organization_id, valid_from, valid_through, opening_hours) values
          ('closed', 'biru', '${day(2)}', '${day(2)}', null),
          ('short', 'biru', '${day(3)}', '${day(3)}', 'Mo-Su 10:00-12:00')
      `);
      await insertOrder('card', at(2, '12:00'));
      await insertOrder('twqr', at(2, '13:00'), 'TWQR');
      await insertOrder('unpaid', at(2, '14:00'), 'Credit', 'OrderPaymentDue');
      await insertOrder('closing', at(3, '11:50'), 'ApplePay');
      await insertOrder(
        'late',
        at(3, '14:00'),
        'Jkopay',
        'OrderPickupAvailable',
      );
      await insertOrder('inside', at(3, '11:00'));
      await insertOrder('weekly', at(5, '19:50'));
      await insertOrder(
        'delivered',
        at(2, '12:00'),
        'Credit',
        'OrderDelivered',
      );
      await insertOrder('refunding', at(2, '12:00'));
      await client.exec(`
        insert into refund (id, order_id, amount, scope, channel, status)
        values ('r1', 'refunding', 100, 'full', 'ecpay', 'pending')
      `);

      const affected = await service.findAffected('biru', all);

      expect(ids(affected.refundOrders)).toEqual(['card', 'closing']);
      expect(ids(affected.manualRefundOrders)).toEqual(['twqr', 'late']);
      expect(ids(affected.unpaidOrders)).toEqual(['unpaid']);
      expect(affected.refundOrders?.[0]).toMatchObject({
        customer: { name: '王小明' },
        orderNumber: 'card',
        total: '100.00',
      });
    });

    it('每週公休日的特殊營業時段改成公休時，列出當天的訂單', async () => {
      const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
      const closedWeekday = weekdays[new Date(day(4)).getUTCDay()];
      await client.exec(
        `update organization set opening_hours = '${weekdays
          .filter((code) => code !== closedWeekday)
          .join(',')} 08:00-20:00' where id = 'biru'`,
      );
      const special = await service.create('biru', {
        validFrom: day(4),
        validThrough: day(4),
        openingHours: 'Mo-Su 10:00-14:00',
      });
      await insertOrder('card', at(4, '11:00'));
      await expect(service.findAffected('biru', all)).resolves.toMatchObject({
        refundOrders: [],
      });

      await service.update('biru', special.id, { openingHours: null });

      await expect(service.findAffected('biru', all)).resolves.toMatchObject({
        refundOrders: [{ id: 'card' }],
      });
    });

    it('改正或刪除特殊營業日後清單變空', async () => {
      await client.exec(`
        insert into organization_special_hours (id, organization_id, valid_from, valid_through, opening_hours)
        values ('closed', 'biru', '${day(2)}', '${day(2)}', null)
      `);
      await insertOrder('card', at(2, '12:00'));
      await expect(service.findAffected('biru', all)).resolves.toMatchObject({
        refundOrders: [{ id: 'card' }],
      });

      await service.remove('biru', 'closed');

      await expect(service.findAffected('biru', all)).resolves.toEqual({
        manualRefundOrders: [],
        refundOrders: [],
        unpaidOrders: [],
        waitlistTickets: [],
      });
    });

    it('今天特殊公休時列出今天仍在候位或叫號中的號碼', async () => {
      await client.exec(`
        insert into organization_special_hours (id, organization_id, valid_from, valid_through, opening_hours)
        values ('closed', 'biru', '${day(0)}', '${day(0)}', null);
        insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale, status, created_at) values
          ('waiting', 'biru', '${day(0)}', 'A', 1, 2, 'zh-TW', 'waiting', now() - interval '2 minutes'),
          ('called', 'biru', '${day(0)}', 'B', 3, 4, 'zh-TW', 'called', now() - interval '1 minute'),
          ('seated', 'biru', '${day(0)}', 'A', 2, 2, 'zh-TW', 'seated', now()),
          ('yesterday', 'biru', '${day(-1)}', 'A', 1, 2, 'zh-TW', 'waiting', now()),
          ('other', 'cafe', '${day(0)}', 'A', 1, 2, 'zh-TW', 'waiting', now());
      `);

      const { waitlistTickets } = await service.findAffected('biru', all);

      expect(waitlistTickets).toEqual([
        expect.objectContaining({ id: 'waiting', ticketNumber: 'A001' }),
        expect.objectContaining({ id: 'called', ticketNumber: 'B003' }),
      ]);
    });

    it('整天特殊公休時，過了每週打烊時間仍列出叫號中的號碼', async () => {
      vi.useFakeTimers({
        now: new Date(`${day(0)}T21:00:00+08:00`),
        toFake: ['Date'],
      });
      onTestFinished(() => {
        vi.useRealTimers();
      });
      await client.exec(`
        insert into organization_special_hours (id, organization_id, valid_from, valid_through, opening_hours)
        values ('closed', 'biru', '${day(0)}', '${day(0)}', null);
        insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale, status)
        values ('called', 'biru', '${day(0)}', 'A', 1, 2, 'zh-TW', 'called');
      `);

      await expect(service.findAffected('biru', all)).resolves.toMatchObject({
        waitlistTickets: [{ id: 'called' }],
      });
    });

    it('沒有權限的類別不列出', async () => {
      await client.exec(`
        insert into organization_special_hours (id, organization_id, valid_from, valid_through, opening_hours)
        values ('closed', 'biru', '${day(0)}', '${day(2)}', null)
      `);
      await insertOrder('card', at(2, '12:00'));

      await expect(
        service.findAffected('biru', { orders: false, waitlist: false }),
      ).resolves.toEqual({});
      await expect(
        service.findAffected('biru', { orders: true, waitlist: false }),
      ).resolves.not.toHaveProperty('waitlistTickets');
      await expect(
        service.findAffected('biru', { orders: false, waitlist: true }),
      ).resolves.toEqual({ waitlistTickets: [] });
    });

    describe('processAffected', () => {
      const process = (
        dto: { orderIds?: string[]; ticketIds?: string[] },
        permissions = all,
      ) => service.processAffected('biru', dto, permissions, 'staff', 'key');

      const insertRefund = (orderId: string, status: string) =>
        client.query(
          `insert into refund (id, order_id, amount, scope, channel, status, reason_code)
           values ($1, $1, 100, 'full', 'ecpay', $2, 'storeClosed')`,
          [orderId, status],
        );

      const statusOf = async (id: string) =>
        (
          await client.query<{ order_status: string }>(
            `select order_status from "order" where id = $1`,
            [id],
          )
        ).rows[0].order_status;

      beforeEach(async () => {
        applyTransitions
          .mockReset()
          .mockImplementation(async (_slug: string, [id]: string[]) => {
            await client.query(
              `update "order" set order_status = 'OrderCancelled' where id = $1`,
              [id],
            );
          });
        refundOrder
          .mockReset()
          .mockImplementation(async (_slug: string, id: string) => {
            await client.query(
              `update "order" set order_status = 'OrderReturned' where id = $1`,
              [id],
            );
            await insertRefund(id, 'settled');

            return { amount: '100.00', status: 'settled' };
          });
        sendOrderStoreClosed.mockReset();
        await client.exec(`
          insert into organization_special_hours (id, organization_id, valid_from, valid_through, opening_hours, note)
          values ('closed', 'biru', '${day(2)}', '${day(2)}', null, '颱風停業');
          insert into "user" (id, name, first_name, email, lang, email_verified)
          values ('amy', 'Amy', 'Amy', 'amy@example.com', 'ja', true)
          on conflict do nothing;
        `);
      });

      it('綠界付款的退款並寄信、未付款的取消、非綠界付款與不受影響的不動', async () => {
        await insertOrder('card', at(2, '12:00'));
        await client.exec(
          `update "order" set customer = '{"name":"Amy","email":"amy@example.com"}', user_id = 'amy' where id = 'card'`,
        );
        await insertOrder('twqr', at(2, '13:00'), 'TWQR');
        await insertOrder(
          'unpaid',
          at(2, '14:00'),
          'Credit',
          'OrderPaymentDue',
        );
        await insertOrder('open', at(3, '12:00'));

        await expect(
          process({ orderIds: ['card', 'twqr', 'unpaid', 'open', 'missing'] }),
        ).resolves.toEqual({
          orders: [
            { id: 'card', status: 'refunded' },
            { id: 'twqr', status: 'manualRefundRequired' },
            { id: 'unpaid', status: 'cancelled' },
            { id: 'open', status: 'skipped' },
            { id: 'missing', status: 'skipped' },
          ],
          waitlistTickets: [],
        });
        expect(refundOrder).toHaveBeenCalledExactlyOnceWith(
          'biru',
          'card',
          { reasonCode: 'storeClosed' },
          'staff',
        );
        expect(applyTransitions).toHaveBeenCalledExactlyOnceWith(
          'biru',
          ['unpaid'],
          'OrderCancelled',
        );
        expect(sendOrderStoreClosed).not.toHaveBeenCalled();
        expect(await statusOf('twqr')).toBe('OrderProcessing');
      });

      it('重送已處理完的請求依目前狀態回報結果，不重複退款', async () => {
        await insertOrder('card', at(2, '12:00'));
        await insertOrder('unknown', at(2, '13:00'));
        await insertOrder(
          'unpaid',
          at(2, '14:00'),
          'Credit',
          'OrderPaymentDue',
        );
        refundOrder.mockImplementation(async (_slug: string, id: string) => {
          if (id === 'unknown') {
            await insertRefund(id, 'pending');
            throw new ServiceUnavailableException({ code: 'resultUnknown' });
          }
          await client.query(
            `update "order" set order_status = 'OrderReturned' where id = $1`,
            [id],
          );
          await insertRefund(id, 'settled');

          return { amount: '100.00', status: 'settled' };
        });
        await client.exec(`
          insert into organization_special_hours (id, organization_id, valid_from, valid_through, opening_hours)
          values ('today', 'biru', '${day(0)}', '${day(0)}', null);
          insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale, status)
          values ('waiting', 'biru', '${day(0)}', 'A', 1, 2, 'zh-TW', 'waiting');
        `);
        const dto = {
          orderIds: ['card', 'unknown', 'unpaid'],
          ticketIds: ['waiting'],
        };

        const first = await process(dto);
        await expect(process(dto)).resolves.toEqual({
          orders: [
            { id: 'card', status: 'refunded' },
            { id: 'unknown', status: 'refundPending' },
            { id: 'unpaid', status: 'skipped' },
          ],
          waitlistTickets: [{ id: 'waiting', status: 'cancelled' }],
        });

        expect(first).toEqual({
          orders: [
            { id: 'card', status: 'refunded' },
            { id: 'unknown', status: 'refundPending' },
            { id: 'unpaid', status: 'cancelled' },
          ],
          waitlistTickets: [{ id: 'waiting', status: 'cancelled' }],
        });
        expect(refundOrder).toHaveBeenCalledTimes(2);
      });

      it('其他原因的退款不算這次公休已處理', async () => {
        await insertOrder('card', at(2, '12:00'), 'Credit', 'OrderReturned');
        await client.query(
          `insert into refund (id, order_id, amount, scope, channel, status, reason_code)
           values ('r', 'card', 100, 'full', 'ecpay', 'settled', 'wrongItem')`,
        );

        await expect(process({ orderIds: ['card'] })).resolves.toMatchObject({
          orders: [{ id: 'card', status: 'skipped' }],
        });
      });

      it('預覽後狀態已變或時段已改正的不處理', async () => {
        await insertOrder('card', at(2, '12:00'));
        await insertOrder(
          'delivered',
          at(2, '13:00'),
          'Credit',
          'OrderDelivered',
        );

        await expect(
          process({ orderIds: ['delivered'] }),
        ).resolves.toMatchObject({
          orders: [{ id: 'delivered', status: 'skipped' }],
        });

        await service.remove('biru', 'closed');

        await expect(process({ orderIds: ['card'] })).resolves.toMatchObject({
          orders: [{ id: 'card', status: 'skipped' }],
        });
        expect(refundOrder).not.toHaveBeenCalled();
      });

      it('批次中途改正時段後，剩下的訂單不再退款或寄信', async () => {
        await insertOrder('first', at(2, '12:00'));
        await insertOrder('second', at(2, '13:00'));
        refundOrder.mockImplementationOnce(async () => {
          await client.exec(`delete from organization_special_hours`);

          return { amount: '100.00', status: 'settled' };
        });

        await expect(
          process({ orderIds: ['first', 'second'] }),
        ).resolves.toMatchObject({
          orders: [
            { id: 'first', status: 'refunded' },
            { id: 'second', status: 'skipped' },
          ],
        });
        expect(refundOrder).toHaveBeenCalledOnce();
      });

      it('綠界退款失敗的維持原狀留在清單，不寄信也不中斷其他筆', async () => {
        await insertOrder('declined', at(2, '12:00'));
        await insertOrder(
          'unpaid',
          at(2, '14:00'),
          'Credit',
          'OrderPaymentDue',
        );
        refundOrder.mockRejectedValueOnce(
          new ConflictException({
            code: 'cardRefundUnavailable',
            message: '無法退刷',
          }),
        );

        await expect(
          process({ orderIds: ['declined', 'unpaid'] }),
        ).resolves.toMatchObject({
          orders: [
            {
              id: 'declined',
              status: 'failed',
              code: 'cardRefundUnavailable',
              message: '無法退刷',
            },
            { id: 'unpaid', status: 'cancelled' },
          ],
        });
        expect(sendOrderStoreClosed).not.toHaveBeenCalled();
        await expect(service.findAffected('biru', all)).resolves.toMatchObject({
          refundOrders: [{ id: 'declined' }],
        });
      });

      describe('onRefundSettled', () => {
        const settle = (
          reasonCode: 'storeClosed' | 'wrongItem' = 'storeClosed',
        ) =>
          service.onRefundSettled({
            orderId: 'card',
            organizationId: 'biru',
            reasonCode,
            refundId: 'card',
          });

        beforeEach(async () => {
          await insertOrder('card', at(2, '12:00'), 'Credit', 'OrderReturned');
          await insertRefund('card', 'settled');
        });

        it('因公休退款完成時寄信給訂購人', async () => {
          await client.exec(
            `update "order" set customer = '{"name":"Amy","email":"amy@example.com"}', user_id = 'amy' where id = 'card'`,
          );

          await settle();

          expect(sendOrderStoreClosed).toHaveBeenCalledExactlyOnceWith({
            amount: '100.00',
            email: 'amy@example.com',
            lang: 'ja',
            note: '颱風停業',
            orderNumber: 'card',
            organizationName: 'Biru',
            pickupTime: new Date(at(2, '12:00')),
          });
        });

        it('沒有 email 或不是因公休退款時不寄信', async () => {
          await settle();
          await client.exec(
            `update "order" set customer = '{"name":"Amy","email":"amy@example.com"}' where id = 'card'`,
          );
          await settle('wrongItem');

          expect(sendOrderStoreClosed).not.toHaveBeenCalled();
        });
      });

      it('今天公休時取消仍在候位的號碼並記下公休原因，已不受影響的不動', async () => {
        await client.exec(`
          insert into organization_special_hours (id, organization_id, valid_from, valid_through, opening_hours)
          values ('today', 'biru', '${day(0)}', '${day(0)}', null);
          insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale, status) values
            ('waiting', 'biru', '${day(0)}', 'A', 1, 2, 'zh-TW', 'waiting'),
            ('seated', 'biru', '${day(0)}', 'A', 2, 2, 'zh-TW', 'seated');
        `);

        await expect(
          process({ ticketIds: ['waiting', 'seated'] }),
        ).resolves.toEqual({
          orders: [],
          waitlistTickets: [
            { id: 'waiting', status: 'cancelled' },
            { id: 'seated', status: 'skipped' },
          ],
        });
        const { rows } = await client.query(
          `select id, status, cancel_reason from waitlist_ticket order by id`,
        );
        expect(rows).toEqual([
          { id: 'seated', status: 'seated', cancel_reason: null },
          { id: 'waiting', status: 'cancelled', cancel_reason: 'storeClosed' },
        ]);
      });

      it('確認後才被帶位的號碼視為已不受影響', async () => {
        await client.exec(`
          insert into organization_special_hours (id, organization_id, valid_from, valid_through, opening_hours)
          values ('today', 'biru', '${day(0)}', '${day(0)}', null);
          insert into waitlist_ticket (id, organization_id, service_date, prefix, number, party_size, locale, status)
          values ('waiting', 'biru', '${day(0)}', 'A', 1, 2, 'zh-TW', 'waiting');
        `);
        vi.spyOn(waitlistService, 'cancelForStoreClosed').mockRejectedValueOnce(
          new BadRequestException({ code: 'waitlistTransitionInvalid' }),
        );

        await expect(process({ ticketIds: ['waiting'] })).resolves.toEqual({
          orders: [],
          waitlistTickets: [{ id: 'waiting', status: 'skipped' }],
        });
      });

      it('沒有該類別的更新權限時拒絕，不處理任何一筆', async () => {
        await insertOrder('card', at(2, '12:00'));

        await expect(
          process({ orderIds: ['card'] }, { orders: false, waitlist: true }),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          process({ ticketIds: ['t'] }, { orders: true, waitlist: false }),
        ).rejects.toThrow(ForbiddenException);
        expect(refundOrder).not.toHaveBeenCalled();
      });
    });
  });
});
