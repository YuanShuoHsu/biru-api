import { sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type {
  OrderFlowStatus,
  OrderStatus,
  PaymentMethod,
} from 'src/db/schema/orders';
import { order } from 'src/db/schema/orders';

import type { AdminOrderResponseDto } from './dto/admin-order-response.dto';
import type { OrderResponseDto } from './dto/order-response.dto';

export const ORDER_TRANSITION_DIRECTIONS = [
  'advance',
  'cancel',
  'revert',
] as const;
export type OrderTransitionDirection =
  (typeof ORDER_TRANSITION_DIRECTIONS)[number];

export interface OrderTransitionRule {
  cashOnly?: boolean;
  direction: OrderTransitionDirection;
  extraSet?: () => PgUpdateSetSource<typeof order>;
  fromStatus: OrderFlowStatus;
  restoresCoupon?: boolean;
  toStatus: OrderStatus;
}

const cashPaidSet = (): PgUpdateSetSource<typeof order> => ({
  amountPerPoint: sql`(SELECT o.amount_per_point FROM organization o WHERE o.id = ${order.sellerId})`,
  paymentDate: new Date(),
  pointsValidityYears: sql`(SELECT o.points_validity_years FROM organization o WHERE o.id = ${order.sellerId})`,
});

const cashUnpaidSet = (): PgUpdateSetSource<typeof order> => ({
  amountPerPoint: null,
  paymentDate: null,
  pointsValidityYears: null,
});

export const ORDER_TRANSITIONS: OrderTransitionRule[] = [
  {
    cashOnly: true,
    direction: 'advance',
    extraSet: cashPaidSet,
    fromStatus: 'OrderPaymentDue',
    toStatus: 'OrderProcessing',
  },
  {
    direction: 'advance',
    fromStatus: 'OrderProcessing',
    toStatus: 'OrderPickupAvailable',
  },
  {
    direction: 'advance',
    fromStatus: 'OrderPickupAvailable',
    toStatus: 'OrderDelivered',
  },
  {
    cashOnly: true,
    direction: 'revert',
    extraSet: cashUnpaidSet,
    fromStatus: 'OrderProcessing',
    toStatus: 'OrderPaymentDue',
  },
  {
    direction: 'revert',
    fromStatus: 'OrderPickupAvailable',
    toStatus: 'OrderProcessing',
  },
  {
    direction: 'revert',
    fromStatus: 'OrderDelivered',
    toStatus: 'OrderPickupAvailable',
  },
  {
    direction: 'cancel',
    fromStatus: 'OrderPaymentDue',
    restoresCoupon: true,
    toStatus: 'OrderCancelled',
  },
];

export const getAvailableTransitions = (found: {
  orderStatus: OrderStatus;
  paymentMethod: PaymentMethod;
}): OrderTransitionRule[] =>
  ORDER_TRANSITIONS.filter(
    (rule) =>
      rule.fromStatus === found.orderStatus &&
      (!rule.cashOnly || found.paymentMethod === 'Cash'),
  );

export const toAdminOrder = (
  found: OrderResponseDto,
): AdminOrderResponseDto => ({
  ...found,
  availableTransitions: getAvailableTransitions(found).map(
    ({ cashOnly, direction, toStatus }) => ({
      ...(cashOnly && { cashOnly }),
      direction,
      toStatus,
    }),
  ),
});
