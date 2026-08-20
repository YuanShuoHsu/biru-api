import { buildRefundPlan } from './refund-plan';

import { BadRequestException } from '@nestjs/common';

const t = ((key: string) => key) as never;

const order = {
  items: [
    { id: 'a', menuItemName: 'A', orderQuantity: 3, unitPrice: '120.00' },
    { id: 'b', menuItemName: 'B', orderQuantity: 2, unitPrice: '76.00' },
    { id: 'c', menuItemName: 'C', orderQuantity: 1, unitPrice: '333.00' },
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
      [{ items: first.items }],
      [{ orderItemId: 'b', quantity: 1 }],
      t,
    );
    const last = buildRefundPlan(
      order,
      [{ items: first.items }, { items: second.items }],
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
    const rest = buildRefundPlan(order, [{ items: first.items }], undefined, t);

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
        [{ items: first.items }],
        [{ orderItemId: 'c', quantity: 1 }],
        t,
      ),
    ).toThrow(BadRequestException);
  });

  it('全額折抵的訂單退款金額為零而不是負數', () => {
    const freeOrder = { items: order.items, total: '0.00' };

    expect(buildRefundPlan(freeOrder, [], undefined, t).amount).toBe(0);
  });
});
