import { EcpayOrderRefundService } from './ecpay-order-refund.service';

import type { Refund } from 'src/db/schema/refunds';

interface Deps {
  claimed: Refund[];
  restore: jest.Mock;
  revokeForOrder: jest.Mock;
  service: EcpayOrderRefundService;
}

const refundRow = {
  id: 'refund-1',
  amount: '100',
  invoiceAction: 'none',
  orderId: 'order-1',
  reason: null,
  scope: 'full',
  status: 'refunded',
} as unknown as Refund;

const settlementOrder = {
  customer: { email: null },
  discountCode: 'SAVE10',
  invoice: null,
  sellerId: 'org-1',
};

const plan = {
  allocatedDiscount: 0,
  amount: 100,
  isFull: true,
  items: [],
  ratio: 1,
};

/**
 * claim 是一次 conditional UPDATE，搶不到就回空陣列。
 * 條件本身由 Postgres 保證，這裡驗的是搶不到時 settle 有沒有真的收手。
 */
const createService = (claimed: Refund[]): Deps => {
  const revokeForOrder = jest.fn();
  const restore = jest.fn();

  const returning = jest.fn(() => Promise.resolve(claimed));
  const writer = {
    update: () => ({
      set: () => ({ returning, where: () => ({ returning }) }),
    }),
  };
  const db = {
    ...writer,
    transaction: (run: (tx: unknown) => Promise<void>) => run(writer),
  };

  const service = new EcpayOrderRefundService(
    db as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { restore } as never,
    { revokeForOrder } as never,
    { emit: jest.fn() } as never,
    { t: jest.fn() } as never,
  );

  return { claimed, restore, revokeForOrder, service };
};

const settle = (deps: Deps): Promise<void> =>
  (
    deps.service as unknown as {
      settle: (a: unknown, b: unknown, c: unknown) => Promise<void>;
    }
  ).settle(refundRow, settlementOrder, plan);

describe('EcpayOrderRefundService settle', () => {
  it('認領成功時回沖點數並還原優惠券', async () => {
    const deps = createService([refundRow]);

    await settle(deps);

    expect(deps.revokeForOrder).toHaveBeenCalledTimes(1);
    expect(deps.restore).toHaveBeenCalledTimes(1);
  });

  it('認領落空時完全不動點數與優惠券', async () => {
    const deps = createService([]);

    await settle(deps);

    expect(deps.revokeForOrder).not.toHaveBeenCalled();
    expect(deps.restore).not.toHaveBeenCalled();
  });
});
