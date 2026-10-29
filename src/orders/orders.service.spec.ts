import { createHash } from 'crypto';

import { BadRequestException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { I18nService } from 'nestjs-i18n';

import type { SpecialOpeningHours } from '../common/utils/opening-hours.js';
import { invoice } from '../db/schema/invoices.js';
import { order } from '../db/schema/orders.js';
import type { CouponsService } from '../coupons/coupons.service.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { LOW_STOCK_REACHED_EVENT } from '../events/low-stock-reached.event.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import {
  InsufficientStockError,
  type InventoryTransactionsService,
} from '../inventory/inventory-transactions.service.js';
import type { MenuStockService } from '../inventory/menu-stock.service.js';
import type { PointsService } from '../points/points.service.js';

import type { CreateOrderDto } from './dto/create-order.dto.js';
import { issueOrderQrSession } from './order-qr-token.js';
import type { OrderQrService } from './order-qr.service.js';
import type { OrderPricingService } from './order-pricing.service.js';
import type { OrderTicketService } from './order-ticket.service.js';
import { OrdersService } from './orders.service.js';
import { POINTS_SNAPSHOT_SET } from './points-snapshot.js';
import type { PrepEstimateService } from './prep-estimate.service.js';

const ORG_ID = 'org';
const QR_SECRET = 'qr-secret';

const resolvedItems = [
  {
    id: 'i1',
    leadTimeMinutes: 0,
    menuItemId: 'm1',
    orderQuantity: 2,
    unitPrice: '60.00',
  },
  {
    id: 'i2',
    leadTimeMinutes: 0,
    menuItemId: 'm2',
    orderQuantity: 1,
    unitPrice: '35.50',
  },
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

const sessionOf = (
  mode: 'counter' | 'dineIn' | 'driveThru',
  tableNumber: number | null = null,
  organizationId = ORG_ID,
  qrSecret: string | null = QR_SECRET,
) => issueOrderQrSession(organizationId, qrSecret, mode, tableNumber).value;

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
  consumeError,
  lowStock = [],
  offerStockChanged = false,
  openingHours = null,
  qrSecret = QR_SECRET,
  queuedPrepMinutes = 0,
  replayed,
  specialHours = [],
  txDuplicate,
}: {
  applied?: { coupon: { code: string }; discount: number } | null;
  closedAt?: Date | null;
  consumeError?: Error;
  lowStock?: { id: string; name: Record<string, string> }[];
  offerStockChanged?: boolean;
  openingHours?: string | null;
  qrSecret?: string | null;
  queuedPrepMinutes?: number;
  replayed?: { id: string; idempotencyFingerprint: string | null };
  specialHours?: SpecialOpeningHours[];
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
          dineInTableCount: 12,
          id: ORG_ID,
          openingHours,
          pickupCutoffMinutes: 15,
          pickupLeadMinutes: 15,
          pickupMaxAdvanceDays: 7,
          pointsValidityYears: 1,
        }),
      },
      organizationSpecialHours: {
        findMany: vi.fn().mockResolvedValue(specialHours),
      },
    },
    select: vi.fn(() => selectChain([{ name: { 'zh-TW': '蛋糕' } }])),
    transaction: vi.fn((callback: (t: typeof tx) => unknown) => callback(tx)),
  };

  const consume = consumeError
    ? vi.fn().mockRejectedValue(consumeError)
    : vi.fn().mockResolvedValue({ lowStock, offerStockChanged });
  const menuStock = { refresh: vi.fn() };

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
  const pointsService = {
    expectedPoints: vi.fn().mockResolvedValue(new Map([['receipt', 12]])),
  };

  return {
    couponsService,
    db,
    emit,
    inserted,
    orderPricingService,
    pointsService,
    service: new OrdersService(
      db as unknown as DrizzleDB,
      couponsService as unknown as CouponsService,
      { consume } as unknown as InventoryTransactionsService,
      orderPricingService as unknown as OrderPricingService,
      {
        secretOf: vi.fn().mockResolvedValue(qrSecret),
      } as unknown as OrderQrService,
      { enqueueOrder: vi.fn() } as unknown as OrderTicketService,
      eventEmitter,
      {
        t: (key: string, options?: { args?: { name?: string } }) =>
          options?.args?.name ? `${key}:${options.args.name}` : key,
      } as unknown as I18nService<I18nTranslations>,
      menuStock as unknown as MenuStockService,
      {
        prepMinutesWith: (_: unknown, ownPrepMinutes: number) =>
          Promise.resolve(queuedPrepMinutes + ownPrepMinutes),
      } as unknown as PrepEstimateService,
      pointsService as unknown as PointsService,
    ),
    consume,
    menuStock,
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
      ['沒掃過桌上 QR code', () => undefined],
      ['掃的是別桌', () => sessionOf('dineIn', 8)],
      ['掃的是別店', () => sessionOf('dineIn', 7, 'other-org')],
      ['掃碼後門市換過 QR secret', () => sessionOf('dineIn', 7, ORG_ID, null)],
      ['掃的是櫃台 QR code', () => sessionOf('counter')],
    ])('內用%s會被擋', async (_, qrSessionOf) => {
      const { db, service } = createService();

      await expect(
        service.createOrder(
          'slug',
          dtoOf({ mode: 'dineIn', tableNumber: 7 }),
          null,
          null,
          qrSessionOf(),
        ),
      ).rejects.toThrow('common.orders.invalidTable');
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('內用掃碼的 session 過期會被擋', async () => {
      const { service } = createService();
      const qrSession = sessionOf('dineIn', 7);
      vi.useFakeTimers({ now: Date.now() + 3 * 60 * 60 * 1000 });

      try {
        await expect(
          service.createOrder(
            'slug',
            dtoOf({ mode: 'dineIn', tableNumber: 7 }),
            null,
            null,
            qrSession,
          ),
        ).rejects.toThrow('common.orders.invalidTable');
      } finally {
        vi.useRealTimers();
      }
    });

    it('店家把桌數調小後，原本掃過的桌號會被擋', async () => {
      const { db, service } = createService();

      await expect(
        service.createOrder(
          'slug',
          dtoOf({ mode: 'dineIn', partySize: 2, tableNumber: 13 }),
          null,
          null,
          sessionOf('dineIn', 13),
        ),
      ).rejects.toThrow('common.orders.invalidTable');
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('內用掃過該桌 QR code 可以下單', async () => {
      const { inserted, service } = createService();

      await service.createOrder(
        'slug',
        dtoOf({ mode: 'dineIn', partySize: 2, tableNumber: 7 }),
        null,
        null,
        sessionOf('dineIn', 7),
      );

      expect(inserted.get(order)).toMatchObject({ tableNumber: 7 });
    });

    it('尚未換過 QR secret 的門市沿用舊金鑰', async () => {
      const { inserted, service } = createService({ qrSecret: null });

      await service.createOrder(
        'slug',
        dtoOf({ mode: 'dineIn', partySize: 2, tableNumber: 7 }),
        null,
        null,
        sessionOf('dineIn', 7, ORG_ID, null),
      );

      expect(inserted.get(order)).toMatchObject({ tableNumber: 7 });
    });

    it.each<
      [
        'counter' | 'driveThru',
        'Cash' | 'Credit',
        string,
        Parameters<typeof sessionOf> | null,
      ]
    >([
      ['counter', 'Cash', '沒掃過店內 QR code', null],
      ['counter', 'Credit', '沒掃過店內 QR code', null],
      ['counter', 'Cash', '掃的是得來速', ['driveThru']],
      ['counter', 'Credit', '掃的是別店', ['counter', null, 'other-org']],
      ['driveThru', 'Credit', '沒掃過店內 QR code', null],
      ['driveThru', 'Credit', '掃的是櫃台', ['counter']],
    ])('%s 付 %s %s會被擋', async (mode, payment, _, scanned) => {
      const { db, service } = createService();

      await expect(
        service.createOrder(
          'slug',
          dtoOf({ mode, payment }),
          null,
          null,
          scanned ? sessionOf(...scanned) : undefined,
        ),
      ).rejects.toThrow('common.orders.inStoreQrCodeRequired');
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['counter', 'Cash'],
      ['counter', 'Credit'],
      ['driveThru', 'Credit'],
    ] as const)('%s 付 %s 掃過店內 QR code 可以下單', async (mode, payment) => {
      const { inserted, service } = createService();

      await service.createOrder(
        'slug',
        dtoOf({ mode, payment }),
        null,
        null,
        sessionOf(mode),
      );

      expect(inserted.get(order)).toMatchObject({
        mode,
        paymentMethod: payment,
      });
    });
  });

  describe('自取取餐時間', () => {
    const NOW = new Date('2026-10-28T10:00:00+08:00');
    const pickupAt = (minutes: number) =>
      new Date(NOW.getTime() + minutes * 60 * 1000).toISOString();
    const pickupDto = (minutes: number) =>
      dtoOf({ mode: 'pickup', pickupTime: pickupAt(minutes) });

    beforeEach(() => {
      vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('品項備餐時間比門市長時，太早的取餐時間會被擋', async () => {
      const { db, orderPricingService, service } = createService();
      orderPricingService.resolveOrderItems.mockResolvedValue([
        resolvedItems[0],
        { ...resolvedItems[1], leadTimeMinutes: 40 },
      ]);

      await expect(
        service.createOrder('slug', pickupDto(30), null, null),
      ).rejects.toThrow('common.orders.pickupTooSoon');
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('取餐時間留足品項備餐時間可以下單', async () => {
      const { inserted, orderPricingService, service } = createService();
      orderPricingService.resolveOrderItems.mockResolvedValue([
        { ...resolvedItems[0], leadTimeMinutes: 40 },
      ]);

      await service.createOrder('slug', pickupDto(45), null, null);

      expect(inserted.get(order)).toMatchObject({
        pickupTime: new Date(pickupAt(45)),
      });
    });

    it('早於門市備餐時間的取餐時間會被擋', async () => {
      const { db, service } = createService();

      await expect(
        service.createOrder('slug', pickupDto(0), null, null),
      ).rejects.toThrow('common.orders.pickupTooSoon');
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('製作中的訂單把最早可取餐時間往後推', async () => {
      const { db, service } = createService({ queuedPrepMinutes: 20 });

      await expect(
        service.createOrder('slug', pickupDto(30), null, null),
      ).rejects.toThrow('common.orders.pickupTooSoon');
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('取餐時間留足佇列與本單製作時間可以下單', async () => {
      const { inserted, service } = createService({ queuedPrepMinutes: 20 });

      await service.createOrder('slug', pickupDto(45), null, null);

      expect(inserted.get(order)).toMatchObject({
        pickupTime: new Date(pickupAt(45)),
      });
    });

    it('品項備餐時間比門市短時，仍以門市備餐時間為準', async () => {
      const { inserted, service } = createService();

      await service.createOrder('slug', pickupDto(15), null, null);

      expect(inserted.get(order)).toMatchObject({
        pickupTime: new Date(pickupAt(15)),
      });
    });

    it('特殊營業日整天公休時拒絕自取', async () => {
      const { db, service } = createService({
        specialHours: [
          {
            openingHours: null,
            validFrom: '2026-10-28',
            validThrough: '2026-10-28',
          },
        ],
      });

      await expect(
        service.createOrder('slug', pickupDto(45), null, null),
      ).rejects.toThrow('common.orders.pickupOutsideOpeningHours');
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('特殊營業日的時段內可以自取，即使每週營業時間沒開', async () => {
      const { inserted, service } = createService({
        openingHours: 'Mo 09:00-18:00',
        specialHours: [
          {
            openingHours: 'We 10:00-18:00',
            validFrom: '2026-10-28',
            validThrough: '2026-10-28',
          },
        ],
      });

      await service.createOrder('slug', pickupDto(45), null, null);

      expect(inserted.get(order)).toMatchObject({
        pickupTime: new Date(pickupAt(45)),
      });
    });

    it('前一天特殊營業日的跨夜時段延到今天凌晨，可以在凌晨自取', async () => {
      const { inserted, service } = createService({
        openingHours: 'Mo 09:00-18:00',
        specialHours: [
          {
            openingHours: 'We 20:00-02:00',
            validFrom: '2026-10-28',
            validThrough: '2026-10-28',
          },
        ],
      });

      await service.createOrder('slug', pickupDto(15 * 60), null, null);
      await expect(
        service.createOrder('slug', pickupDto(16 * 60 + 30), null, null),
      ).rejects.toThrow('common.orders.pickupOutsideOpeningHours');

      expect(inserted.get(order)).toMatchObject({
        pickupTime: new Date(pickupAt(15 * 60)),
      });
    });

    it('取餐時間在特殊營業日的時段外會被擋', async () => {
      const { service } = createService({
        specialHours: [
          {
            openingHours: 'We 14:00-18:00',
            validFrom: '2026-10-28',
            validThrough: '2026-10-28',
          },
        ],
      });

      await expect(
        service.createOrder('slug', pickupDto(45), null, null),
      ).rejects.toThrow('common.orders.pickupOutsideOpeningHours');
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

      await service.createOrder(
        'slug',
        baseDto,
        null,
        'key',
        sessionOf('counter'),
      );

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
        service.createOrder('slug', baseDto, null, 'key', sessionOf('counter')),
      ).resolves.toBeDefined();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('同 key 不同內容回 409', async () => {
      const { db, service } = createService({
        replayed: { id: 'existing', idempotencyFingerprint: 'other' },
      });

      await expect(
        service.createOrder('slug', baseDto, null, 'key', sessionOf('counter')),
      ).rejects.toThrow(ConflictException);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('交易內才發現重複時不新增也不廣播', async () => {
      const { emit, service, tx } = createService({
        txDuplicate: { id: 'existing', orderStatus: 'OrderPaymentDue' },
      });

      await service.createOrder(
        'slug',
        baseDto,
        null,
        'key',
        sessionOf('counter'),
      );

      expect(tx.insert).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('寫入的指紋就是重送時比對的指紋', async () => {
      const { inserted, service } = createService();

      await service.createOrder(
        'slug',
        baseDto,
        null,
        'key',
        sessionOf('counter'),
      );

      expect(inserted.get(order)).toMatchObject({
        idempotencyFingerprint: fingerprintOf(baseDto),
        idempotencyKey: 'key',
      });
    });
  });

  describe('金額', () => {
    it('沒用券時小計取品項加總並開發票', async () => {
      const { emit, inserted, service } = createService();

      await service.createOrder(
        'slug',
        baseDto,
        null,
        null,
        sessionOf('counter'),
      );

      expect(inserted.get(order)).toMatchObject({
        orderNumber: '5',
        orderStatus: 'OrderPaymentDue',
        subtotal: '156.00',
      });
      expect(inserted.get(order)).not.toHaveProperty('discount');
      expect(inserted.has(invoice)).toBe(true);
      expect(emit).toHaveBeenCalledOnce();
    });

    it('回傳的收據帶上這張單付款後可得的點數', async () => {
      const { pointsService, service } = createService();

      await expect(
        service.createOrder(
          'slug',
          baseDto,
          'member',
          null,
          sessionOf('counter'),
        ),
      ).resolves.toMatchObject({ expectedPoints: 12 });
      expect(pointsService.expectedPoints).toHaveBeenCalledWith(['receipt']);
    });

    it('扣庫存後跌破門檻的食材在交易完成後廣播', async () => {
      const lowStock = [{ id: 'milk', name: { 'zh-TW': '鮮奶' } }];
      const { emit, service } = createService({ lowStock });

      await service.createOrder(
        'slug',
        baseDto,
        null,
        null,
        sessionOf('counter'),
      );

      expect(emit).toHaveBeenCalledWith(LOW_STOCK_REACHED_EVENT, {
        organizationId: ORG_ID,
        ingredients: lowStock,
      });
    });

    it('建單時檢查剩餘數量，交易完成後同步售完狀態', async () => {
      const { consume, menuStock, service } = createService({
        offerStockChanged: true,
      });

      await service.createOrder(
        'slug',
        baseDto,
        null,
        null,
        sessionOf('counter'),
      );

      expect(consume).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        {
          enforceStock: true,
        },
      );
      expect(menuStock.refresh).toHaveBeenCalledWith(ORG_ID, true);
    });

    it('剩餘數量不足時回傳品項名稱，不同步售完狀態', async () => {
      const { menuStock, service } = createService({
        consumeError: new InsufficientStockError('cake'),
      });

      await expect(
        service.createOrder('slug', baseDto, null, null, sessionOf('counter')),
      ).rejects.toThrow(
        new BadRequestException('common.orders.menuItemInsufficientStock:蛋糕'),
      );
      expect(menuStock.refresh).not.toHaveBeenCalled();
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
        sessionOf('counter'),
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
        sessionOf('counter'),
      );

      expect(inserted.get(order)).toMatchObject({
        ...POINTS_SNAPSHOT_SET,
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
        service.createOrder('slug', baseDto, null, null, sessionOf('counter')),
      ).rejects.toThrow('common.orders.orderTotalTooLarge');
      expect(db.transaction).not.toHaveBeenCalled();
    });
  });
});

describe('OrdersService.canReadOrderById', () => {
  const serviceWith = (role: string | null) => {
    const { db, service } = createService();
    const findMember = vi.fn().mockResolvedValue(role && { role });
    Object.assign(db.query, {
      member: { findFirst: findMember },
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'o1',
          sellerId: ORG_ID,
          userId: 'customer',
        }),
      },
    });
    return { findMember, service };
  };

  it('沒有成員資格的平台管理員可以讀', async () => {
    const { findMember, service } = serviceWith(null);

    await expect(
      service.canReadOrderById('o1', { id: 'platform', role: 'admin' }, null),
    ).resolves.toBe(true);
    expect(findMember).not.toHaveBeenCalled();
  });

  it('沒有成員資格的一般使用者不能讀', async () => {
    await expect(
      serviceWith(null).service.canReadOrderById(
        'o1',
        { id: 'stranger', role: 'user' },
        null,
      ),
    ).resolves.toBe(false);
  });

  it('門市成員可以讀', async () => {
    await expect(
      serviceWith('member').service.canReadOrderById(
        'o1',
        { id: 'staff', role: 'user' },
        null,
      ),
    ).resolves.toBe(true);
  });
});
