import { type SQL, isNull } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { OrderStatus, PaymentMethod } from 'src/db/schema/orders';
import { ORDER_FLOW_STATUSES, order } from 'src/db/schema/orders';
import type { RefundChannel } from 'src/db/schema/refunds';

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

export type OrderTransitionTrigger = 'admin' | 'expiry' | 'payment';

export interface OrderTransitionRule {
  cashOnly?: boolean;
  consumesInventory?: boolean;
  direction: OrderTransitionDirection;
  extraSet?: () => PgUpdateSetSource<typeof order>;
  fromStatus: OrderStatus;
  recordsPayment?: boolean;
  restoresCoupon?: boolean;
  restoresInventory?: boolean;
  toStatus: OrderStatus;
  triggers: readonly OrderTransitionTrigger[];
  where?: () => SQL;
}

export const CANCEL_UNPAID_ORDER: OrderTransitionRule = {
  direction: 'cancel',
  fromStatus: 'OrderPaymentDue',
  restoresCoupon: true,
  restoresInventory: true,
  toStatus: 'OrderCancelled',
  triggers: ['admin', 'expiry'],
};

export const ORDER_TRANSITIONS: OrderTransitionRule[] = [
  {
    cashOnly: true,
    direction: 'advance',
    extraSet: () => ({ ...POINTS_SNAPSHOT_SET, paymentDate: new Date() }),
    fromStatus: 'OrderPaymentDue',
    recordsPayment: true,
    toStatus: 'OrderProcessing',
    triggers: ['admin'],
  },
  {
    direction: 'advance',
    fromStatus: 'OrderProcessing',
    toStatus: 'OrderPickupAvailable',
    triggers: ['admin'],
  },
  {
    direction: 'advance',
    fromStatus: 'OrderPickupAvailable',
    toStatus: 'OrderDelivered',
    triggers: ['admin'],
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
    triggers: ['admin'],
  },
  {
    direction: 'revert',
    fromStatus: 'OrderPickupAvailable',
    toStatus: 'OrderProcessing',
    triggers: ['admin'],
  },
  {
    direction: 'revert',
    fromStatus: 'OrderDelivered',
    toStatus: 'OrderPickupAvailable',
    triggers: ['admin'],
  },
  CANCEL_UNPAID_ORDER,
  {
    direction: 'advance',
    extraSet: () => POINTS_SNAPSHOT_SET,
    fromStatus: 'OrderPaymentDue',
    recordsPayment: true,
    toStatus: 'OrderProcessing',
    triggers: ['payment'],
  },
  {
    direction: 'cancel',
    fromStatus: 'OrderPaymentDue',
    restoresCoupon: true,
    restoresInventory: true,
    toStatus: 'OrderProblem',
    triggers: ['payment'],
  },
  {
    consumesInventory: true,
    direction: 'advance',
    extraSet: () => POINTS_SNAPSHOT_SET,
    fromStatus: 'OrderProblem',
    recordsPayment: true,
    toStatus: 'OrderProcessing',
    triggers: ['payment'],
    // 轉異常時已還券，券可能已被別人用完，帶券的訂單不能自動補回
    where: () => isNull(order.discountCode),
  },
];

export const findTransition = (
  trigger: OrderTransitionTrigger,
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
): OrderTransitionRule | undefined =>
  ORDER_TRANSITIONS.find(
    (rule) =>
      rule.triggers.includes(trigger) &&
      rule.fromStatus === fromStatus &&
      rule.toStatus === toStatus,
  );

export const isRefundable = (found: {
  orderStatus: OrderStatus;
  paymentDate?: Date | null;
}): boolean =>
  !!found.paymentDate &&
  (ORDER_FLOW_STATUSES as readonly string[]).includes(found.orderStatus) &&
  found.orderStatus !== 'OrderPaymentDue';

const ECPAY_REFUNDABLE_METHODS: PaymentMethod[] = ['ApplePay', 'Credit'];

export const getRefundChannel = (
  paymentMethod: PaymentMethod,
): RefundChannel =>
  ECPAY_REFUNDABLE_METHODS.includes(paymentMethod) ? 'ecpay' : 'manual';

export const getAvailableTransitions = (found: {
  orderStatus: OrderStatus;
  paymentMethod: PaymentMethod;
}): OrderTransitionRule[] =>
  ORDER_TRANSITIONS.filter(
    (rule) =>
      rule.triggers.includes('admin') &&
      rule.fromStatus === found.orderStatus &&
      (!rule.cashOnly || found.paymentMethod === 'Cash'),
  );

export const toAdminOrder = (
  found: OrderResponseDto,
): AdminOrderResponseDto => ({
  ...found,
  refundable: isRefundable(found),
  refundChannel: getRefundChannel(found.paymentMethod),
  availableTransitions: getAvailableTransitions(found).map(
    ({ cashOnly, direction, toStatus }) => ({
      ...(cashOnly && { cashOnly }),
      direction,
      toStatus,
    }),
  ),
});
