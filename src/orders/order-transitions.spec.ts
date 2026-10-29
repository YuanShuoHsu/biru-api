import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { I18nService } from 'nestjs-i18n';

import type { OrderStatus, PaymentMethod } from '../db/schema/orders.js';
import type { CouponsService } from '../coupons/coupons.service.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { LOW_STOCK_REACHED_EVENT } from '../events/low-stock-reached.event.js';
import { ORDER_PAID_EVENT } from '../events/order-paid.event.js';
import { ORDER_STATUS_UPDATED_EVENT } from '../events/order-status-updated.event.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import type { InventoryTransactionsService } from '../inventory/inventory-transactions.service.js';
import type { MenuStockService } from '../inventory/menu-stock.service.js';
import type { PointsService } from '../points/points.service.js';

import {
  findTransition,
  getAvailableTransitions,
  getRefundChannel,
  isRefundable,
  ORDER_TRANSITIONS,
} from './order-transitions.js';
import type { OrderPricingService } from './order-pricing.service.js';
import type { OrderQrService } from './order-qr.service.js';
import type { OrderTicketService } from './order-ticket.service.js';
import { OrdersService } from './orders.service.js';
import type { PrepEstimateService } from './prep-estimate.service.js';

const available = (orderStatus: OrderStatus, paymentMethod: PaymentMethod) =>
  getAvailableTransitions({ orderStatus, paymentMethod }).map(
    ({ direction, toStatus }) => `${direction}:${toStatus}`,
  );

describe('訂單狀態轉換規則表', () => {
  it.each<[OrderStatus, PaymentMethod, string[]]>([
    [
      'OrderPaymentDue',
      'Cash',
      ['advance:OrderProcessing', 'cancel:OrderCancelled'],
    ],
    ['OrderPaymentDue', 'Credit', ['cancel:OrderCancelled']],
    [
      'OrderProcessing',
      'Cash',
      ['advance:OrderPickupAvailable', 'revert:OrderPaymentDue'],
    ],
    ['OrderProcessing', 'Credit', ['advance:OrderPickupAvailable']],
    [
      'OrderPickupAvailable',
      'Credit',
      ['advance:OrderDelivered', 'revert:OrderProcessing'],
    ],
    ['OrderDelivered', 'Credit', ['revert:OrderPickupAvailable']],
    ['OrderCancelled', 'Cash', []],
    ['OrderProblem', 'Credit', []],
    ['OrderReturned', 'Credit', []],
  ])('%s／%s 的店員可用操作', (status, method, expected) => {
    expect(available(status, method).sort()).toEqual(expected.sort());
  });

  it('同一觸發來源下，起訖狀態組合不重複', () => {
    const keys = ORDER_TRANSITIONS.flatMap((rule) =>
      rule.triggers.map(
        (trigger) => `${trigger}:${rule.fromStatus}->${rule.toStatus}`,
      ),
    );

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('店員不能把線上付款的訂單手動標為已付款', () => {
    const rule = findTransition('admin', 'OrderPaymentDue', 'OrderProcessing');

    expect(rule?.cashOnly).toBe(true);
  });

  it('店員不能把異常訂單手動補回製作中', () => {
    expect(
      findTransition('admin', 'OrderProblem', 'OrderProcessing'),
    ).toBeUndefined();
  });

  it('逾時只能取消未付款訂單', () => {
    const expiryRules = ORDER_TRANSITIONS.filter(({ triggers }) =>
      triggers.includes('expiry'),
    );

    expect(
      expiryRules.map(({ fromStatus, toStatus }) => [fromStatus, toStatus]),
    ).toEqual([['OrderPaymentDue', 'OrderCancelled']]);
  });

  it('付款成功會記錄付款並快照點數規則', () => {
    const rule = findTransition(
      'payment',
      'OrderPaymentDue',
      'OrderProcessing',
    );

    expect(rule?.recordsPayment).toBe(true);
    expect(rule?.extraSet?.()).toHaveProperty('amountPerPoint');
    expect(rule?.extraSet?.()).toHaveProperty('pointsValidityYears');
  });

  it('付款失敗轉異常時還券、還庫存', () => {
    const rule = findTransition('payment', 'OrderPaymentDue', 'OrderProblem');

    expect(rule).toMatchObject({
      restoresCoupon: true,
      restoresInventory: true,
    });
  });

  it('異常訂單後來付款成功，要重新扣庫存且限沒有用券的訂單', () => {
    const rule = findTransition('payment', 'OrderProblem', 'OrderProcessing');

    expect(rule?.consumesInventory).toBe(true);
    expect(rule?.recordsPayment).toBe(true);
    expect(rule?.where).toBeDefined();
  });

  it('現金退回待付款會清掉付款時間與點數快照', () => {
    const rule = findTransition('admin', 'OrderProcessing', 'OrderPaymentDue');

    expect(rule?.extraSet?.()).toEqual({
      amountPerPoint: null,
      paymentDate: null,
      pointsValidityYears: null,
    });
  });

  it('製作完成記下出餐時間，退回製作中清除，從已取餐退回保留原值', () => {
    expect(
      findTransition(
        'admin',
        'OrderProcessing',
        'OrderPickupAvailable',
      )?.extraSet?.(),
    ).toEqual({ readyAt: expect.any(Date) });
    expect(
      findTransition(
        'admin',
        'OrderPickupAvailable',
        'OrderProcessing',
      )?.extraSet?.(),
    ).toEqual({ readyAt: null });
    expect(
      findTransition('admin', 'OrderDelivered', 'OrderPickupAvailable')
        ?.extraSet,
    ).toBeUndefined();
  });

  it('只有製作完成會寫入出餐時間', () => {
    expect(
      ORDER_TRANSITIONS.filter(
        (rule) => rule.extraSet?.().readyAt instanceof Date,
      ).map(({ fromStatus, toStatus }) => [fromStatus, toStatus]),
    ).toEqual([['OrderProcessing', 'OrderPickupAvailable']]);
  });

  it('凡是會還券的規則也會還庫存', () => {
    for (const rule of ORDER_TRANSITIONS.filter(
      ({ restoresCoupon }) => restoresCoupon,
    ))
      expect(rule.restoresInventory).toBe(true);
  });

  it.each<[OrderStatus, Date | null, boolean]>([
    ['OrderProcessing', new Date(), true],
    ['OrderDelivered', new Date(), true],
    ['OrderPaymentDue', new Date(), false],
    ['OrderProcessing', null, false],
    ['OrderReturned', new Date(), false],
    ['OrderProblem', new Date(), false],
  ])('%s（付款時間 %s）可否退款：%s', (orderStatus, paymentDate, expected) => {
    expect(isRefundable({ orderStatus, paymentDate })).toBe(expected);
  });

  it.each<[PaymentMethod, string]>([
    ['Credit', 'ecpay'],
    ['ApplePay', 'ecpay'],
    ['Cash', 'manual'],
  ])('%s 的退款管道是 %s', (method, channel) => {
    expect(getRefundChannel(method)).toBe(channel);
  });
});

type OrderRow = {
  discountCode: string | null;
  id: string;
  orderStatus: OrderStatus;
  paymentDate?: Date | null;
  paymentMethod: PaymentMethod;
  sellerId: string;
  total?: string;
  tradeNo?: string | null;
};

const createService = ({
  current,
  found,
  updated,
}: {
  current?: OrderRow;
  found?: Partial<OrderRow> & { merchantTradeNo?: string };
  updated: OrderRow[];
}) => {
  const sets: unknown[] = [];

  const tx = {
    select: vi.fn(() => {
      const chain = {
        from: () => chain,
        where: () =>
          Object.assign(Promise.resolve(current ? [current] : []), {
            for: () => Promise.resolve(current ? [current] : []),
          }),
      };
      return chain;
    }),
    update: vi.fn(() => ({
      set: (values: unknown) => {
        sets.push(values);
        return { where: () => ({ returning: () => Promise.resolve(updated) }) };
      },
    })),
  };

  const db = {
    query: {
      order: {
        findFirst: vi.fn().mockResolvedValue(found),
        findMany: vi.fn().mockResolvedValue(current ? [current] : []),
      },
      organization: {
        findFirst: vi.fn().mockResolvedValue({ id: 'org' }),
      },
    },
    select: tx.select,
    transaction: vi.fn((callback: (t: typeof tx) => unknown) => callback(tx)),
  };

  const couponsService = { restore: vi.fn() };
  const inventory = { consume: vi.fn(), restoreAll: vi.fn() };
  const menuStock = { refresh: vi.fn() };
  const orderTickets = { enqueueOrder: vi.fn(), withdrawOrder: vi.fn() };
  const eventEmitter = new EventEmitter2();
  const emit = vi.spyOn(eventEmitter, 'emit');

  return {
    couponsService,
    emit,
    inventory,
    orderTickets,
    service: new OrdersService(
      db as unknown as DrizzleDB,
      couponsService as unknown as CouponsService,
      inventory as unknown as InventoryTransactionsService,
      {} as OrderPricingService,
      {} as OrderQrService,
      orderTickets as unknown as OrderTicketService,
      eventEmitter,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
      menuStock as unknown as MenuStockService,
      {} as PrepEstimateService,
      {} as PointsService,
    ),
    sets,
  };
};

const unpaid: OrderRow = {
  discountCode: 'SAVE10',
  id: 'o1',
  orderStatus: 'OrderPaymentDue',
  paymentMethod: 'Cash',
  sellerId: 'org',
};

const emittedEvents = (emit: { mock: { calls: unknown[][] } }) =>
  emit.mock.calls.map(([event]) => event);

describe('OrdersService.applyTransitions', () => {
  it('取消未付款訂單會還券、還庫存並通知，不算付款', async () => {
    const { couponsService, emit, inventory, service } = createService({
      current: unpaid,
      updated: [{ ...unpaid, orderStatus: 'OrderCancelled' }],
    });

    await service.applyTransitions('slug', ['o1'], 'OrderCancelled');

    expect(couponsService.restore).toHaveBeenCalledWith(expect.anything(), {
      code: 'SAVE10',
      orderId: 'o1',
    });
    expect(inventory.restoreAll).toHaveBeenCalledWith('o1', expect.anything());
    expect(emittedEvents(emit)).toEqual([ORDER_STATUS_UPDATED_EVENT]);
  });

  it('現金收款會送出已付款事件並排工作單', async () => {
    const { emit, orderTickets, sets, service } = createService({
      current: unpaid,
      updated: [{ ...unpaid, orderStatus: 'OrderProcessing' }],
    });

    await service.applyTransitions('slug', ['o1'], 'OrderProcessing');

    expect(sets[0]).toMatchObject({ orderStatus: 'OrderProcessing' });
    expect(sets[0]).toHaveProperty('paymentDate');
    expect(emittedEvents(emit)).toEqual([
      ORDER_STATUS_UPDATED_EVENT,
      ORDER_PAID_EVENT,
    ]);
    expect(orderTickets.enqueueOrder).toHaveBeenCalledWith(
      expect.anything(),
      'o1',
      'org',
    );
  });

  it('退回待付款會撤下還沒送出的工作單，不再排新的', async () => {
    const processing: OrderRow = { ...unpaid, orderStatus: 'OrderProcessing' };
    const { orderTickets, service } = createService({
      current: processing,
      updated: [{ ...processing, orderStatus: 'OrderPaymentDue' }],
    });

    await service.applyTransitions('slug', ['o1'], 'OrderPaymentDue');

    expect(orderTickets.withdrawOrder).toHaveBeenCalledWith(
      expect.anything(),
      'o1',
    );
    expect(orderTickets.enqueueOrder).not.toHaveBeenCalled();
  });

  it('店員標為可取餐時寫入出餐時間', async () => {
    const processing: OrderRow = {
      ...unpaid,
      orderStatus: 'OrderProcessing',
      paymentMethod: 'Credit',
    };
    const { sets, service } = createService({
      current: processing,
      updated: [{ ...processing, orderStatus: 'OrderPickupAvailable' }],
    });

    await service.applyTransitions('slug', ['o1'], 'OrderPickupAvailable');

    expect(sets[0]).toEqual({
      orderStatus: 'OrderPickupAvailable',
      readyAt: expect.any(Date),
    });
  });

  it('線上付款的待付款訂單不能手動推進', async () => {
    const { emit, sets, service } = createService({
      current: { ...unpaid, paymentMethod: 'Credit' },
      updated: [],
    });

    await expect(
      service.applyTransitions('slug', ['o1'], 'OrderProcessing'),
    ).rejects.toThrow(BadRequestException);
    expect(sets).toEqual([]);
    expect(emit).not.toHaveBeenCalled();
  });

  it('狀態被別人先改掉時整批失敗、不送通知', async () => {
    const { emit, service } = createService({ current: unpaid, updated: [] });

    await expect(
      service.applyTransitions('slug', ['o1'], 'OrderCancelled'),
    ).rejects.toThrow('statusChanged');
    expect(emit).not.toHaveBeenCalled();
  });
});

const paymentBody = (overrides: Record<string, string> = {}) => ({
  MerchantTradeNo: 'mtn1',
  PaymentDate: '2026/10/22 12:00:00',
  RtnCode: '1',
  RtnMsg: 'paid',
  TradeAmt: '155',
  TradeNo: 'tn1',
  ...overrides,
});

describe('OrdersService.recordPaymentResult', () => {
  const pending: OrderRow = {
    discountCode: null,
    id: 'o1',
    orderStatus: 'OrderPaymentDue',
    paymentMethod: 'Credit',
    sellerId: 'org',
  };

  it('模擬付款通知直接忽略', async () => {
    const { service, sets } = createService({ current: pending, updated: [] });

    await expect(
      service.recordPaymentResult(paymentBody({ SimulatePaid: '1' })),
    ).resolves.toBe('ignored');
    expect(sets).toEqual([]);
  });

  it('綠界回報待確認的代碼不改狀態', async () => {
    const { service, sets } = createService({ current: pending, updated: [] });

    await expect(
      service.recordPaymentResult(paymentBody({ RtnCode: '10300066' })),
    ).resolves.toBe('ignored');
    expect(sets).toEqual([]);
  });

  it('付款成功轉製作中、送出已付款事件並排工作單', async () => {
    const { emit, orderTickets, service, sets } = createService({
      current: pending,
      updated: [{ ...pending, orderStatus: 'OrderProcessing' }],
    });

    await expect(service.recordPaymentResult(paymentBody())).resolves.toBe(
      'handled',
    );
    expect(sets[0]).toMatchObject({
      merchantTradeNo: 'mtn1',
      orderStatus: 'OrderProcessing',
      tradeNo: 'tn1',
    });
    expect(emittedEvents(emit)).toContain(ORDER_PAID_EVENT);
    expect(orderTickets.enqueueOrder).toHaveBeenCalledWith(
      expect.anything(),
      'o1',
      'org',
    );
  });

  it('付款失敗轉異常並還券、還庫存', async () => {
    const { inventory, service } = createService({
      current: pending,
      updated: [
        { ...pending, discountCode: 'SAVE10', orderStatus: 'OrderProblem' },
      ],
    });

    await expect(
      service.recordPaymentResult(paymentBody({ RtnCode: '10100058' })),
    ).resolves.toBe('handled');
    expect(inventory.restoreAll).toHaveBeenCalledWith('o1', expect.anything());
  });

  it('異常訂單補付款重新扣庫存，跌破門檻的食材在交易後推播', async () => {
    const problem: OrderRow = { ...pending, orderStatus: 'OrderProblem' };
    const { emit, inventory, service } = createService({
      current: problem,
      updated: [{ ...problem, orderStatus: 'OrderProcessing' }],
    });
    const ingredients = [{ id: 'i1', name: { 'zh-TW': '牛奶' } }];
    inventory.consume.mockResolvedValue({
      lowStock: ingredients,
      offerStockChanged: false,
    });

    await expect(service.recordPaymentResult(paymentBody())).resolves.toBe(
      'handled',
    );
    expect(inventory.consume).toHaveBeenCalledWith('o1', expect.anything());
    expect(emit).toHaveBeenCalledWith(LOW_STOCK_REACHED_EVENT, {
      ingredients,
      organizationId: 'org',
    });
  });

  it('重新扣庫存沒有跌破門檻時不推播', async () => {
    const problem: OrderRow = { ...pending, orderStatus: 'OrderProblem' };
    const { emit, inventory, service } = createService({
      current: problem,
      updated: [{ ...problem, orderStatus: 'OrderProcessing' }],
    });
    inventory.consume.mockResolvedValue({
      lowStock: [],
      offerStockChanged: false,
    });

    await service.recordPaymentResult(paymentBody());

    expect(emittedEvents(emit)).not.toContain(LOW_STOCK_REACHED_EVENT);
  });

  it('金額不符時不認列', async () => {
    const { emit, service } = createService({
      current: pending,
      found: { ...pending, paymentDate: null, total: '200' },
      updated: [],
    });

    await expect(service.recordPaymentResult(paymentBody())).resolves.toBe(
      'unmatched',
    );
    expect(emit).not.toHaveBeenCalled();
  });

  it('同一筆付款重送視為已處理', async () => {
    const { service } = createService({
      current: { ...pending, orderStatus: 'OrderProcessing' },
      found: { paymentDate: new Date(), total: '155', tradeNo: 'tn1' },
      updated: [],
    });

    await expect(service.recordPaymentResult(paymentBody())).resolves.toBe(
      'handled',
    );
  });

  it('已付款的訂單又收到另一筆付款，要人工退款', async () => {
    const { service } = createService({
      current: { ...pending, orderStatus: 'OrderProcessing' },
      found: { paymentDate: new Date(), total: '155', tradeNo: 'tn-old' },
      updated: [],
    });

    await expect(service.recordPaymentResult(paymentBody())).resolves.toBe(
      'unmatched',
    );
  });

  it('找不到對應訂單', async () => {
    const { service } = createService({ updated: [] });

    await expect(service.recordPaymentResult(paymentBody())).resolves.toBe(
      'unmatched',
    );
  });
});
