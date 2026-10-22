import { createHash } from 'crypto';

import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { I18nService } from 'nestjs-i18n';

import { invoice } from '../db/schema/invoices.js';
import { order } from '../db/schema/orders.js';
import type { CouponsService } from '../coupons/coupons.service.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import type { InventoryTransactionsService } from '../inventory/inventory-transactions.service.js';

import type { CreateOrderDto } from './dto/create-order.dto.js';
import { dineInTableToken, orderModeToken } from './order-qr-token.js';
import type { OrderPricingService } from './order-pricing.service.js';
import { OrdersService } from './orders.service.js';

const ORG_ID = 'org';

const resolvedItems = [
  { id: 'i1', menuItemId: 'm1', orderQuantity: 2, unitPrice: '60.00' },
  { id: 'i2', menuItemId: 'm2', orderQuantity: 1, unitPrice: '35.50' },
];

const dtoOf = (overrides: Partial<CreateOrderDto> = {}) =>
  ({
    customer: { name: '王小明' },
    invoice: { type: 'B2C' },
    items: [],
    mode: 'counter',
    payment: 'Credit',
    ...overrides,
  }) as CreateOrderDto;

const baseDto = dtoOf();

const fingerprintOf = (dto: CreateOrderDto) =>
  createHash('sha256').update(JSON.stringify(dto)).digest('hex');

const selectChain = (rows: unknown[]) => {
  const chain = {
    from: () => chain,
    where: () =>
      Object.assign(Promise.resolve(rows), { for: () => Promise.resolve([]) }),
  };
  return chain;
};

const createService = ({
  applied = null,
  closedAt = null,
  replayed,
  txDuplicate,
}: {
  applied?: { coupon: { code: string }; discount: number } | null;
  closedAt?: Date | null;
  replayed?: { id: string; idempotencyFingerprint: string | null };
  txDuplicate?: { id: string; orderStatus: string };
} = {}) => {
  const inserted = new Map<unknown, unknown>();

  const tx = {
    insert: vi.fn((table: unknown) => ({
      values: (values: unknown) => {
        inserted.set(table, values);
        return {
          returning: () =>
            Promise.resolve(
              Array.isArray(values) ? values : [values as object],
            ),
        };
      },
    })),
    query: { order: { findFirst: vi.fn().mockResolvedValue(txDuplicate) } },
    select: vi.fn(() => selectChain([{ value: 4 }])),
  };

  const db = {
    query: {
      order: {
        findFirst: vi.fn(({ columns }: { columns: object }) =>
          Promise.resolve(
            'idempotencyFingerprint' in columns
              ? replayed
              : { id: 'receipt', invoices: [], items: [] },
          ),
        ),
      },
      organization: {
        findFirst: vi.fn().mockResolvedValue({
          amountPerPoint: '100',
          closedAt,
          currency: 'TWD',
          id: ORG_ID,
          pointsValidityYears: 1,
        }),
      },
    },
    transaction: vi.fn((callback: (t: typeof tx) => unknown) => callback(tx)),
  };

  const couponsService = {
    getApplicableCoupon: vi
      .fn()
      .mockResolvedValue(applied && { ...applied, userCouponId: null }),
    redeem: vi.fn(),
  };
  const orderPricingService = {
    resolveOrderItems: vi.fn().mockResolvedValue(resolvedItems),
  };
  const eventEmitter = new EventEmitter2();
  const emit = vi.spyOn(eventEmitter, 'emit');

  return {
    couponsService,
    db,
    emit,
    inserted,
    orderPricingService,
    service: new OrdersService(
      db as unknown as DrizzleDB,
      couponsService as unknown as CouponsService,
      { consume: vi.fn() } as unknown as InventoryTransactionsService,
      orderPricingService as unknown as OrderPricingService,
      eventEmitter,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
    ),
    tx,
  };
};

describe('OrdersService.createOrder', () => {
  beforeAll(() => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  describe('簽章與付款方式', () => {
    it('自取不能付現金', async () => {
      const { db, service } = createService();

      await expect(
        service.createOrder(
          'slug',
          dtoOf({ mode: 'pickup', payment: 'Cash' }),
          null,
          null,
        ),
      ).rejects.toThrow('Cash is unavailable');
      expect(db.query.organization.findFirst).not.toHaveBeenCalled();
    });

    it('非自取帶 pickupTime 會被擋', async () => {
      const { service } = createService();

      await expect(
        service.createOrder(
          'slug',
          dtoOf({ pickupTime: '2026-10-22T12:00:00+08:00' }),
          null,
          null,
        ),
      ).rejects.toThrow('pickupTime is unavailable');
    });

    it.each([
      ['沒帶簽章', undefined],
      ['簽章屬於別桌', dineInTableToken(ORG_ID, 8)],
      ['簽章屬於別店', dineInTableToken('other-org', 7)],
    ])('內用%s會被擋', async (_, tableToken) => {
      const { db, service } = createService();

      await expect(
        service.createOrder(
          'slug',
          dtoOf({ mode: 'dineIn', tableNumber: 7, tableToken }),
          null,
          null,
        ),
      ).rejects.toThrow('common.orders.invalidTable');
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('內用帶正確桌號簽章可以下單', async () => {
      const { inserted, service } = createService();

      await service.createOrder(
        'slug',
        dtoOf({
          mode: 'dineIn',
          partySize: 2,
          tableNumber: 7,
          tableToken: dineInTableToken(ORG_ID, 7),
        }),
        null,
        null,
      );

      expect(inserted.get(order)).toMatchObject({ tableNumber: 7 });
    });

    it.each([
      ['沒帶簽章', undefined],
      ['簽章屬於別的模式', orderModeToken(ORG_ID, 'driveThru')],
      ['簽章屬於別店', orderModeToken('other-org', 'counter')],
    ])('櫃檯付現金%s會被擋', async (_, modeToken) => {
      const { db, service } = createService();

      await expect(
        service.createOrder(
          'slug',
          dtoOf({ modeToken, payment: 'Cash' }),
          null,
          null,
        ),
      ).rejects.toThrow('common.orders.cashRequiresInStoreQrCode');
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('櫃檯付現金帶店內 QR code 簽章可以下單', async () => {
      const { inserted, service } = createService();

      await service.createOrder(
        'slug',
        dtoOf({
          modeToken: orderModeToken(ORG_ID, 'counter'),
          payment: 'Cash',
        }),
        null,
        null,
      );

      expect(inserted.get(order)).toMatchObject({ paymentMethod: 'Cash' });
    });

    it('櫃檯線上付款不需要簽章', async () => {
      const { db, service } = createService();

      await service.createOrder('slug', baseDto, null, null);

      expect(db.transaction).toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('同 key 同內容重送直接回原訂單，不再建單', async () => {
      const { db, service } = createService({
        replayed: {
          id: 'existing',
          idempotencyFingerprint: fingerprintOf(baseDto),
        },
      });

      await service.createOrder('slug', baseDto, null, 'key');

      expect(db.transaction).not.toHaveBeenCalled();
      expect(db.query.order.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({ with: expect.anything() }),
      );
    });

    it('已停業仍可取回停業前建立的訂單', async () => {
      const { db, service } = createService({
        closedAt: new Date(),
        replayed: {
          id: 'existing',
          idempotencyFingerprint: fingerprintOf(baseDto),
        },
      });

      await expect(
        service.createOrder('slug', baseDto, null, 'key'),
      ).resolves.toBeDefined();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('同 key 不同內容回 409', async () => {
      const { db, service } = createService({
        replayed: { id: 'existing', idempotencyFingerprint: 'other' },
      });

      await expect(
        service.createOrder('slug', baseDto, null, 'key'),
      ).rejects.toThrow(ConflictException);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('交易內才發現重複時不新增也不廣播', async () => {
      const { emit, service, tx } = createService({
        txDuplicate: { id: 'existing', orderStatus: 'OrderPaymentDue' },
      });

      await service.createOrder('slug', baseDto, null, 'key');

      expect(tx.insert).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('寫入的指紋就是重送時比對的指紋', async () => {
      const { inserted, service } = createService();

      await service.createOrder('slug', baseDto, null, 'key');

      expect(inserted.get(order)).toMatchObject({
        idempotencyFingerprint: fingerprintOf(baseDto),
        idempotencyKey: 'key',
      });
    });
  });

  describe('金額', () => {
    it('沒用券時小計取品項加總並開發票', async () => {
      const { emit, inserted, service } = createService();

      await service.createOrder('slug', baseDto, null, null);

      expect(inserted.get(order)).toMatchObject({
        orderNumber: '5',
        orderStatus: 'OrderPaymentDue',
        subtotal: '156.00',
      });
      expect(inserted.get(order)).not.toHaveProperty('discount');
      expect(inserted.has(invoice)).toBe(true);
      expect(emit).toHaveBeenCalledOnce();
    });

    it('折扣寫入訂單並核銷優惠券', async () => {
      const { couponsService, inserted, service } = createService({
        applied: { coupon: { code: 'SAVE30' }, discount: 30 },
      });

      await service.createOrder(
        'slug',
        dtoOf({ discountCode: 'save30' }),
        'user',
        null,
      );

      expect(couponsService.getApplicableCoupon).toHaveBeenCalledWith(
        ORG_ID,
        'save30',
        resolvedItems,
        'user',
      );
      expect(inserted.get(order)).toMatchObject({
        discount: '30.00',
        discountCode: 'SAVE30',
        discountCurrency: 'TWD',
        orderStatus: 'OrderPaymentDue',
        subtotal: '156.00',
      });
      expect(couponsService.redeem).toHaveBeenCalledOnce();
      expect(inserted.has(invoice)).toBe(true);
    });

    it('全額折抵直接成立且不開發票', async () => {
      const { inserted, service } = createService({
        applied: { coupon: { code: 'FREE' }, discount: 156 },
      });

      await service.createOrder(
        'slug',
        dtoOf({ discountCode: 'FREE' }),
        'user',
        null,
      );

      expect(inserted.get(order)).toMatchObject({
        amountPerPoint: '100',
        orderStatus: 'OrderProcessing',
        paymentDate: expect.any(Date),
      });
      expect(inserted.has(invoice)).toBe(false);
    });

    it('總額超過上限會被擋', async () => {
      const { db, orderPricingService, service } = createService();
      orderPricingService.resolveOrderItems.mockResolvedValue([
        { id: 'i1', menuItemId: 'm1', orderQuantity: 2, unitPrice: '50000000' },
      ]);

      await expect(
        service.createOrder('slug', baseDto, null, null),
      ).rejects.toThrow('common.orders.orderTotalTooLarge');
      expect(db.transaction).not.toHaveBeenCalled();
    });
  });
});
