import type { OrdersService } from '../../orders/orders.service.js';
import { ECPAY_TRADE_STATUS } from '../dto/query-trade-info-ecpay.dto.js';

import type { EcpayCallbackLogService } from './ecpay-callback-log.service.js';
import type { EcpayQueryTradeInfoService } from './ecpay-query-trade-info.service.js';
import { EcpayUnpaidOrderReconcileService } from './ecpay-unpaid-order-reconcile.service.js';

vi.mock('../utils/ecpay.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/ecpay.js')>()),
  sleep: () => Promise.resolve(),
}));

const LONG_AGO = new Date('2026-01-01T00:00:00Z');

const candidateOf = (
  id: string,
  attempts: number,
  paymentDeadline = LONG_AGO,
) => ({
  confirmationNumber: `c-${id}`,
  id,
  merchantTradeNos: Array.from({ length: attempts }, (_, i) => `${id}-${i}`),
  orderStatus: 'OrderPaymentDue' as const,
  paymentDeadline,
  paymentMethod: 'Credit' as const,
});

const setup = (
  candidates: ReturnType<typeof candidateOf>[],
  paidTradeNos: string[] = [],
  defaultStatus: string = ECPAY_TRADE_STATUS.NotFound,
) => {
  const ordersService = {
    cancelOrders: vi.fn(),
    findOrdersToReconcile: vi.fn().mockResolvedValue(candidates),
    markReconciled: vi.fn(),
    recordPaymentResult: vi.fn().mockResolvedValue('unmatched'),
  };
  const queryTradeInfo = vi.fn((merchantTradeNo: string) =>
    Promise.resolve({
      MerchantTradeNo: merchantTradeNo,
      PaymentDate: '',
      TradeAmt: '100',
      TradeNo: 't',
      TradeStatus: paidTradeNos.includes(merchantTradeNo)
        ? ECPAY_TRADE_STATUS.Paid
        : defaultStatus,
    }),
  );

  const service = new EcpayUnpaidOrderReconcileService(
    ordersService as unknown as OrdersService,
    { queryTradeInfo } as unknown as EcpayQueryTradeInfoService,
    {
      markHandled: vi.fn(),
      record: vi.fn().mockResolvedValue('log'),
    } as unknown as EcpayCallbackLogService,
  );

  const queriedOrders = () =>
    new Set(queryTradeInfo.mock.calls.map(([no]) => no.split('-')[0]));
  const cancelled = (call: number) =>
    ordersService.cancelOrders.mock.calls[call][0] as string[];

  return { cancelled, ordersService, queriedOrders, queryTradeInfo, service };
};

describe('EcpayUnpaidOrderReconcileService', () => {
  it('每輪查詢綠界的次數有上限，不論每張訂單有幾次付款嘗試', async () => {
    const { cancelled, queryTradeInfo, service } = setup([
      candidateOf('a', 10),
      candidateOf('b', 10),
      candidateOf('c', 10),
    ]);

    await service.reconcileExpiredUnpaidOrders();

    expect(queryTradeInfo).toHaveBeenCalledTimes(20);
    expect(cancelled(0)).toEqual(['a', 'b']);
  });

  it('剩餘額度查不完一張訂單的嘗試時跳過，下一輪優先查它', async () => {
    const { cancelled, ordersService, queriedOrders, queryTradeInfo, service } =
      setup([candidateOf('a', 15), candidateOf('b', 10), candidateOf('c', 5)]);

    await service.reconcileExpiredUnpaidOrders();

    expect(queriedOrders()).toEqual(new Set(['a', 'c']));
    expect(cancelled(0)).toEqual(['a', 'c']);

    ordersService.findOrdersToReconcile.mockResolvedValue([
      candidateOf('b', 10),
      candidateOf('d', 15),
    ]);
    queryTradeInfo.mockClear();

    await service.reconcileExpiredUnpaidOrders();

    expect(queriedOrders()).toEqual(new Set(['b']));
    expect(cancelled(1)).toEqual(['b']);
  });

  it('沒結案的訂單輪流查，不會讓排在前面的訂單一直佔掉額度', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { cancelled, queriedOrders, queryTradeInfo, service } = setup(
      ['a', 'b', 'c'].map((id) => candidateOf(id, 10, new Date())),
      [],
      ECPAY_TRADE_STATUS.Unpaid,
    );

    await service.reconcileExpiredUnpaidOrders();
    expect(queriedOrders()).toEqual(new Set(['a', 'b']));

    queryTradeInfo.mockClear();
    vi.advanceTimersByTime(5 * 60_000);
    await service.reconcileExpiredUnpaidOrders();
    vi.useRealTimers();

    expect(queryTradeInfo.mock.calls[0][0]).toBe('c-0');
    expect(queriedOrders()).toEqual(new Set(['a', 'c']));
    expect(cancelled(1)).toEqual([]);
  });

  it('付款嘗試超過每輪額度的訂單分輪接著查較舊的，查到最舊那筆付了款', async () => {
    const { cancelled, ordersService, queryTradeInfo, service } = setup(
      [candidateOf('a', 25)],
      ['a-24'],
    );

    await service.reconcileExpiredUnpaidOrders();
    expect(queryTradeInfo).toHaveBeenCalledTimes(20);
    expect(cancelled(0)).toEqual([]);

    queryTradeInfo.mockClear();
    await service.reconcileExpiredUnpaidOrders();

    expect(queryTradeInfo.mock.calls.map(([no]) => no)).toEqual([
      'a-20',
      'a-21',
      'a-22',
      'a-23',
      'a-24',
    ]);
    expect(ordersService.recordPaymentResult).toHaveBeenCalledWith(
      expect.objectContaining({ MerchantTradeNo: 'a-24' }),
    );
    expect(cancelled(1)).toEqual([]);
  });

  it('付款嘗試超過每輪額度的訂單全部查過都沒付款才取消', async () => {
    const { cancelled, queryTradeInfo, service } = setup([
      candidateOf('a', 25),
    ]);

    await service.reconcileExpiredUnpaidOrders();
    expect(cancelled(0)).toEqual([]);

    await service.reconcileExpiredUnpaidOrders();
    expect(cancelled(1)).toEqual(['a']);
    expect(new Set(queryTradeInfo.mock.calls.map(([no]) => no)).size).toBe(25);
    expect(queryTradeInfo).toHaveBeenCalledTimes(25);
  });

  it('付款嘗試從新到舊查，查到已付款就停', async () => {
    const { queryTradeInfo, service } = setup([candidateOf('a', 5)], ['a-0']);

    await service.reconcileExpiredUnpaidOrders();

    expect(queryTradeInfo).toHaveBeenCalledTimes(1);
  });

  it('綠界已付款但無法自動認列的訂單不取消', async () => {
    const { cancelled, ordersService, service } = setup(
      [candidateOf('a', 3)],
      ['a-1'],
    );

    await service.reconcileExpiredUnpaidOrders();

    expect(ordersService.recordPaymentResult).toHaveBeenCalledOnce();
    expect(cancelled(0)).toEqual([]);
    expect(ordersService.markReconciled).toHaveBeenCalledWith([]);
  });
});
