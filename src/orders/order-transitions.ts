import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type {
  order,
  OrderFlowStatus,
  OrderStatus,
  PaymentMethod,
} from 'src/db/schema/orders';

import type { AdminOrderResponseDto } from './dto/admin-order-response.dto';
import type { OrderResponseDto } from './dto/order-response.dto';

import { POINTS_SNAPSHOT_SET } from './points-snapshot';

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
  recordsPayment?: boolean;
  restoresCoupon?: boolean;
  toStatus: OrderStatus;
}

export const ORDER_TRANSITIONS: OrderTransitionRule[] = [
  {
    cashOnly: true,
    direction: 'advance',
    extraSet: () => ({ ...POINTS_SNAPSHOT_SET, paymentDate: new Date() }),
    fromStatus: 'OrderPaymentDue',
    recordsPayment: true,
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
    extraSet: () => ({
      amountPerPoint: null,
      paymentDate: null,
      pointsValidityYears: null,
    }),
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
