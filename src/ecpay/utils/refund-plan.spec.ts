import { buildRefundPlan } from './refund-plan.js';

import { BadRequestException } from '@nestjs/common';

import type { RefundItemSnapshot } from '../../db/schema/refunds.js';

const t = ((key: string) => key) as never;

const order = {
  items: [
    {
      discount: null,
      id: 'a',
      menuItemName: 'A',
      orderQuantity: 3,
      unitPrice: '120.00',
    },
    {
      discount: null,
      id: 'b',
      menuItemName: 'B',
      orderQuantity: 2,
      unitPrice: '76.00',
    },
    {
      discount: null,
      id: 'c',
      menuItemName: 'C',
      orderQuantity: 1,
      unitPrice: '333.00',
    },
  ],
  total: '700.00',
};

describe('buildRefundPlan', () => {
  it('分次退完的金額總和剛好等於實收金額', () => {
    const first = buildRefundPlan(
      order,
      [],
      [{ orderItemId: 'a', quantity: 2 }],
      t,
    );
    const second = buildRefundPlan(
      order,
      [{ amount: String(first.amount), items: first.items }],
      [{ orderItemId: 'b', quantity: 1 }],
      t,
    );
    const last = buildRefundPlan(
      order,
      [
        { amount: String(first.amount), items: first.items },
        { amount: String(second.amount), items: second.items },
      ],
      undefined,
      t,
    );

    expect(first.amount + second.amount + last.amount).toBe(700);
    expect(last.isFull).toBe(true);
  });

  it('省略 items 時只退尚未退過的數量', () => {
    const first = buildRefundPlan(
      order,
      [],
      [{ orderItemId: 'a', quantity: 1 }],
      t,
    );
    const rest = buildRefundPlan(
      order,
      [{ amount: String(first.amount), items: first.items }],
      undefined,
      t,
    );

    expect(
      rest.items.find(({ orderItemId }) => orderItemId === 'a')?.quantity,
    ).toBe(2);
    expect(rest.isFull).toBe(true);
  });

  it('退超過剩餘數量會被擋下來', () => {
    const first = buildRefundPlan(
      order,
      [],
      [{ orderItemId: 'c', quantity: 1 }],
      t,
    );

    expect(() =>
      buildRefundPlan(
        order,
        [{ amount: String(first.amount), items: first.items }],
        [{ orderItemId: 'c', quantity: 1 }],
        t,
      ),
    ).toThrow(BadRequestException);
  });

  it('全額折抵的訂單退款金額為零而不是負數', () => {
    const freeOrder = { items: order.items, total: '0.00' };

    expect(buildRefundPlan(freeOrder, [], undefined, t).amount).toBe(0);
  });
  describe('每行有記錄折扣時照該行折扣退', () => {
    const itemCouponOrder = {
      items: [
        {
          discount: '0.00',
          id: 'a',
          menuItemName: 'A',
          orderQuantity: 1,
          unitPrice: '100.00',
        },
        {
          discount: '50.00',
          id: 'b',
          menuItemName: 'B',
          orderQuantity: 3,
          unitPrice: '100.00',
        },
      ],
      total: '350.00',
    };

    it('只退沒折扣的品項時全額退回', () => {
      const plan = buildRefundPlan(
        itemCouponOrder,
        [],
        [{ orderItemId: 'a', quantity: 1 }],
        t,
      );

      expect(plan.allocatedDiscount).toBe(0);
      expect(plan.amount).toBe(100);
    });

    it('只退有折扣的品項時扣回該行的折扣', () => {
      const plan = buildRefundPlan(
        itemCouponOrder,
        [],
        [{ orderItemId: 'b', quantity: 3 }],
        t,
      );

      expect(plan.allocatedDiscount).toBe(50);
      expect(plan.amount).toBe(250);
    });

    it('分次退完的金額總和剛好等於實收金額', () => {
      const previous: { amount: string; items: RefundItemSnapshot[] }[] = [];
      const plans = [
        [{ orderItemId: 'b', quantity: 1 }],
        [{ orderItemId: 'b', quantity: 1 }],
        [{ orderItemId: 'a', quantity: 1 }],
        undefined,
      ].map((requested) => {
        const plan = buildRefundPlan(itemCouponOrder, previous, requested, t);
        previous.push({ amount: String(plan.amount), items: plan.items });
        return plan;
      });

      expect(plans.map((plan) => plan.amount)).toEqual([83, 84, 100, 83]);
      expect(plans.at(-1)?.isFull).toBe(true);
    });

    it('先退有折扣的品項，最後只退沒折扣的品項時不被加上尾差', () => {
      const tenPercentOrder = {
        items: ['a', 'b', 'c'].map((id, index) => ({
          discount: index < 2 ? '5.67' : '5.66',
          id,
          menuItemName: id,
          orderQuantity: 1,
          unitPrice: '55.00',
        })),
        total: '153.00',
      };
      tenPercentOrder.items.push({
        discount: '0.00',
        id: 'x',
        menuItemName: 'x',
        orderQuantity: 1,
        unitPrice: '5.00',
      });

      const previous: { amount: string; items: RefundItemSnapshot[] }[] = [];
      const amounts = ['a', 'b', 'c', 'x'].map((orderItemId) => {
        const plan = buildRefundPlan(
          tenPercentOrder,
          previous,
          [{ orderItemId, quantity: 1 }],
          t,
        );
        previous.push({ amount: String(plan.amount), items: plan.items });
        return plan.amount;
      });

      expect(amounts).toEqual([49, 50, 49, 5]);
    });

    it('折扣超過品項取整後的金額時，該行最多退到 0', () => {
      const fullCouponOrder = {
        items: [
          {
            discount: '10.50',
            id: 'a',
            menuItemName: 'A',
            orderQuantity: 1,
            unitPrice: '10.40',
          },
          {
            discount: '10.50',
            id: 'b',
            menuItemName: 'B',
            orderQuantity: 1,
            unitPrice: '10.40',
          },
          {
            discount: '0.00',
            id: 'c',
            menuItemName: 'C',
            orderQuantity: 1,
            unitPrice: '50.00',
          },
        ],
        total: '50.00',
      };

      const plan = buildRefundPlan(
        fullCouponOrder,
        [],
        [{ orderItemId: 'a', quantity: 1 }],
        t,
      );

      expect(plan.amount).toBe(0);
    });
  });
});
