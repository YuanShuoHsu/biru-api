import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { invoice } from './invoices';
import { organization } from './organizations';
import { user } from './users';

// counter＝現場外帶、pickup＝線上外帶；kiosk 是收現金的機台不是點餐模式，故不在此列
export const orderModeEnum = pgEnum('order_mode', [
  'counter',
  'dineIn',
  'driveThru',
  'pickup',
]);
export type OrderMode = (typeof orderModeEnum.enumValues)[number];

// https://schema.org/PaymentMethod
export const paymentMethodEnum = pgEnum('order_payment_method', [
  'ApplePay',
  'Cash',
  'Credit',
  'iPASS',
  'Jkopay',
  'TWQR',
  'WeiXin',
]);
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];

// https://schema.org/OrderStatus
// 順序即出餐流程，前後相鄰者才能互相轉換，重排會改變狀態機
export const ORDER_FLOW_STATUSES = [
  'OrderPaymentDue',
  'OrderProcessing',
  'OrderPickupAvailable',
  'OrderDelivered',
] as const;
export const ORDER_TERMINAL_STATUSES = [
  'OrderCancelled',
  'OrderProblem',
  'OrderReturned',
] as const;
export const orderStatusEnum = pgEnum('order_status', [
  ...ORDER_FLOW_STATUSES,
  ...ORDER_TERMINAL_STATUSES,
]);
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type OrderFlowStatus = (typeof ORDER_FLOW_STATUSES)[number];

// https://schema.org/customer
export interface OrderCustomerSnapshot {
  email?: string | null;
  name: string;
  remark?: string | null;
  telephone?: string | null;
}

export interface OrderItemModifierSnapshot {
  modifierGroupId: string;
  modifierGroupName: string;
  modifierId: string;
  modifierName: string;
  priceAdjustment: string | null;
}

export interface OrderItemAddOnSnapshot {
  menuItemId: string;
  menuItemName: string;
  unitPrice: string;
  modifiers: OrderItemModifierSnapshot[];
}

// https://schema.org/Order
export const order = pgTable(
  'order',
  {
    id: text('id').primaryKey(),
    confirmationNumber: text('confirmation_number').unique(),
    customer: jsonb('customer').$type<OrderCustomerSnapshot>().notNull(),
    discount: numeric('discount', { precision: 10, scale: 2 }),
    discountCode: text('discount_code'),
    discountCurrency: text('discount_currency').default('TWD'),
    mode: orderModeEnum('mode').notNull(),
    orderDate: timestamp('order_date').defaultNow().notNull(),
    orderNumber: text('order_number').notNull(),
    orderStatus: orderStatusEnum('order_status')
      .notNull()
      .default('OrderPaymentDue'),
    paymentDate: timestamp('payment_date'),
    paymentDueDate: timestamp('payment_due_date'),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    paymentMethodId: text('payment_method_id'),
    // https://schema.org/seller
    sellerId: text('seller_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    // additional fields
    subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
    total: numeric('total', { precision: 10, scale: 2 })
      .notNull()
      .generatedAlwaysAs(sql`"subtotal" - coalesce("discount", 0)`),
    amountPerPoint: numeric('amount_per_point', { precision: 10, scale: 2 }),
    pointsValidityYears: integer('points_validity_years'),
    idempotencyKey: text('idempotency_key'),
    partySize: integer('party_size'),
    tableNumber: integer('table_number'),
    tradeNo: text('trade_no'),
    // https://schema.org/customer
    userId: text('user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('order_sellerId_idx').on(table.sellerId),
    index('order_sellerId_createdAt_idx').on(table.sellerId, table.createdAt),
    index('order_sellerId_total_idx').on(table.sellerId, table.total),
    index('order_orderNumber_idx').on(table.orderNumber),
    index('order_confirmationNumber_idx').on(table.confirmationNumber),
    index('order_userId_createdAt_idx').on(table.userId, table.createdAt),
    index('order_sellerId_salesAt_idx').on(
      table.sellerId,
      sql`COALESCE(${table.paymentDate}, ${table.orderDate})`,
    ),
    index('order_paymentDue_createdAt_idx')
      .on(table.orderStatus, table.createdAt)
      .where(sql`${table.orderStatus} = 'OrderPaymentDue'`),
    uniqueIndex('order_sellerId_idempotencyKey_unique').on(
      table.sellerId,
      table.idempotencyKey,
    ),
  ],
);

export type Order = typeof order.$inferSelect;

// https://schema.org/OrderItem
export const orderItem = pgTable(
  'order_item',
  {
    id: text('id').primaryKey(),
    addOns: jsonb('add_ons').$type<OrderItemAddOnSnapshot[]>(),
    menuItemId: text('menu_item_id').notNull(),
    menuItemName: text('menu_item_name').notNull(),
    modifiers: jsonb('modifiers').$type<OrderItemModifierSnapshot[]>(),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    orderQuantity: integer('order_quantity').notNull(),
    // https://schema.org/priceCurrency
    priceCurrency: text('price_currency').default('TWD'),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
    ...timestamps,
  },
  (table) => [index('orderItem_orderId_idx').on(table.orderId)],
);

export type OrderItem = typeof orderItem.$inferSelect;

export const orderRelations = relations(order, ({ one, many }) => ({
  seller: one(organization, {
    fields: [order.sellerId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [order.userId],
    references: [user.id],
  }),
  invoice: one(invoice, {
    fields: [order.id],
    references: [invoice.orderId],
  }),
  items: many(orderItem),
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(order, {
    fields: [orderItem.orderId],
    references: [order.id],
  }),
}));
