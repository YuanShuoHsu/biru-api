import { BadRequestException } from '@nestjs/common';

import type { RefundItemSnapshot } from 'src/db/schema/refunds';

import { STORE_UTC_OFFSET } from 'src/common/constants/timezone';

const round = (value: number): number => Math.round(value);

export interface RefundPlan {
  allocatedDiscount: number;
  amount: number;
  isFull: boolean;
  items: RefundItemSnapshot[];
  ratio: number;
}

export interface RefundableOrder {
  items: {
    id: string;
    menuItemName: string;
    orderQuantity: number;
    unitPrice: string;
  }[];
  total: string;
}

const sumRefundItems = (items: RefundItemSnapshot[]): number =>
  items.reduce((sum, item) => sum + Number(item.amount), 0);

/**
 * 折讓明細的金額必須精準等於折讓總額，且原發票把優惠券折扣開成一筆負數品項，
 * 所以部分退款要把折扣按原價比例分攤回去，否則多次折讓的總和會超出發票金額。
 */
export const buildRefundPlan = (
  found: RefundableOrder,
  previous: { items: RefundItemSnapshot[] | null }[],
  requestedItems?: { orderItemId: string; quantity: number }[],
): RefundPlan => {
  const refundedQuantities = new Map<string, number>();
  for (const row of previous)
    for (const item of row.items ?? [])
      refundedQuantities.set(
        item.orderItemId,
        (refundedQuantities.get(item.orderItemId) ?? 0) + item.quantity,
      );

  const requested =
    requestedItems ??
    found.items
      .map((item) => ({
        orderItemId: item.id,
        // 先前已部分退過時，這裡要退的是剩下的數量
        quantity: item.orderQuantity - (refundedQuantities.get(item.id) ?? 0),
      }))
      .filter((item) => item.quantity > 0);

  const items: RefundItemSnapshot[] = requested.map((input) => {
    const source = found.items.find((item) => item.id === input.orderItemId);
    if (!source)
      throw new BadRequestException(
        `Order item ${input.orderItemId} does not belong to this order`,
      );

    const remaining =
      source.orderQuantity - (refundedQuantities.get(source.id) ?? 0);
    if (input.quantity > remaining)
      throw new BadRequestException(
        `Order item ${source.menuItemName} has only ${remaining} left to refund`,
      );

    return {
      amount: String(round(Number(source.unitPrice) * input.quantity)),
      menuItemName: source.menuItemName,
      orderItemId: source.id,
      quantity: input.quantity,
      unitPrice: source.unitPrice,
    };
  });

  if (!items.length) throw new BadRequestException('Nothing to refund');

  const itemTotal = round(
    found.items.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.orderQuantity,
      0,
    ),
  );
  const salesAmount = round(Number(found.total));
  const discount = itemTotal - salesAmount;

  const isFull = found.items.every(
    (item) =>
      (refundedQuantities.get(item.id) ?? 0) +
        (items.find((i) => i.orderItemId === item.id)?.quantity ?? 0) >=
      item.orderQuantity,
  );

  // 退到最後一筆時把折扣的取整餘數一次補齊，總和才會剛好等於實收金額
  const previouslyAllocated = previous.reduce(
    (sum, row) =>
      sum + round((discount * sumRefundItems(row.items ?? [])) / itemTotal),
    0,
  );
  const allocatedDiscount = isFull
    ? discount - previouslyAllocated
    : round((discount * sumRefundItems(items)) / itemTotal);

  const amount = sumRefundItems(items) - allocatedDiscount;
  if (amount <= 0)
    throw new BadRequestException('Refund amount must be positive');

  return {
    allocatedDiscount,
    amount,
    isFull,
    items,
    ratio: salesAmount ? Math.min(amount / salesAmount, 1) : 0,
  };
};

export const earliestVoidableInvoiceDate = (now: Date): Date => {
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const month = taipei.getUTCMonth() + 1;

  let lockedMonth =
    month % 2 === 1
      ? taipei.getUTCDate() > 13
        ? month
        : month - 2
      : month - 1;
  let lockedYear = taipei.getUTCFullYear();

  if (lockedMonth <= 0) {
    lockedMonth += 12;
    lockedYear -= 1;
  }

  return new Date(
    `${lockedYear}-${String(lockedMonth).padStart(2, '0')}-01T00:00:00${STORE_UTC_OFFSET}`,
  );
};
