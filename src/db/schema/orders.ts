import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { invoice } from './invoices';
import { organization } from './organizations';

export const orderModeEnum = pgEnum('order_mode', ['dineIn', 'pickup']);
export type OrderMode = (typeof orderModeEnum.enumValues)[number];

// https://schema.org/PaymentMethod
export const paymentMethodEnum = pgEnum('order_payment_method', [
  'Cash',
  'Credit',
  'TWQR',
  'WeiXin',
]);
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];

// https://schema.org/OrderStatus
export const orderStatusEnum = pgEnum('order_status', [
  'OrderCancelled',
  'OrderDelivered',
  'OrderPaymentDue',
  'OrderPickupAvailable',
  'OrderProcessing',
  'OrderProblem',
]);
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

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
    // https://schema.org/seller
    sellerId: text('seller_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    mode: orderModeEnum('mode').notNull(),
    orderNumber: text('order_number').notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone'),
    customerEmail: text('customer_email'),
    customerNotes: text('customer_notes'),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    orderStatus: orderStatusEnum('order_status')
      .notNull()
      .default('OrderPaymentDue'),
    confirmationNumber: text('confirmation_number').unique(),
    orderDate: timestamp('order_date').defaultNow().notNull(),
    paymentDueDate: timestamp('payment_due_date'),
    discount: numeric('discount', { precision: 10, scale: 2 }),
    discountCurrency: text('discount_currency').default('TWD'),
    discountCode: text('discount_code'),
    ...timestamps,
  },
  (table) => [
    index('order_sellerId_idx').on(table.sellerId),
    index('order_orderNumber_idx').on(table.orderNumber),
    index('order_confirmationNumber_idx').on(table.confirmationNumber),
  ],
);

export type Order = typeof order.$inferSelect;

// https://schema.org/OrderItem
export const orderItem = pgTable(
  'order_item',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    menuItemId: text('menu_item_id').notNull(),
    menuItemName: text('menu_item_name').notNull(),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
    orderQuantity: integer('order_quantity').notNull(),
    modifiers: jsonb('modifiers').$type<OrderItemModifierSnapshot[]>(),
    addOns: jsonb('add_ons').$type<OrderItemAddOnSnapshot[]>(),
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
