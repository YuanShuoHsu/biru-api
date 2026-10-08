import { type SQL, and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { order, orderItem, type OrderStatus } from 'src/db/schema/orders';
import { refund, type RefundStatus } from 'src/db/schema/refunds';

import { utcTimestampParam } from 'src/common/utils/stats-buckets';

export const COUNTED_ORDER_STATUSES = [
  'OrderProcessing',
  'OrderPickupAvailable',
  'OrderDelivered',
  'OrderReturned',
] as const satisfies readonly OrderStatus[];

export const isCountedOrder = inArray(order.orderStatus, [
  ...COUNTED_ORDER_STATUSES,
]);

// pending 是退刷結果未明，錢可能還沒退出去
export const isConfirmedRefund = inArray(refund.status, [
  'refunded',
  'settling',
  'settled',
] satisfies RefundStatus[]);

// 綠界回調未帶 PaymentDate 時 payment_date 會是 null，退回下單時間
export const COUNTED_AT = sql`COALESCE(${order.paymentDate}, ${order.orderDate})`;

// 銷售依計入時間、退款依退款時間各自歸期，與營收的退款口徑一致；退款列為負份數
export const orderItemMovements = (
  organizationId: string,
  from: Date,
  to?: Date,
): SQL => sql`
  SELECT ${orderItem.id} AS order_item_id, ${orderItem.orderQuantity} AS quantity
  FROM ${orderItem}
  JOIN ${order} ON ${order.id} = ${orderItem.orderId}
  WHERE ${and(
    eq(order.sellerId, organizationId),
    isCountedOrder,
    gte(COUNTED_AT, utcTimestampParam(from)),
    to && lt(COUNTED_AT, utcTimestampParam(to)),
  )}
  UNION ALL
  SELECT refunded_item.value ->> 'orderItemId', -(refunded_item.value ->> 'quantity')::int
  FROM ${refund}
  JOIN ${order} ON ${order.id} = ${refund.orderId}
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(${refund.items}, '[]'::jsonb)) AS refunded_item
  WHERE ${and(
    eq(order.sellerId, organizationId),
    isConfirmedRefund,
    gte(refund.createdAt, utcTimestampParam(from)),
    to && lt(refund.createdAt, utcTimestampParam(to)),
  )}
`;
