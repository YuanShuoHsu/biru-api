import { relations } from 'drizzle-orm';
import { integer, json, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { menuItems, stores, tables } from './stores';
import { user } from './users';

export const orderStatusesEnum = pgEnum('order_statuses', [
  'pending',
  'completed',
  'cancelled',
]);
export type OrderStatusEnum = (typeof orderStatusesEnum.enumValues)[number];

export const DEFAULT_ORDER_STATUS: OrderStatusEnum = 'pending';

export const orders = pgTable('orders', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  storeId: text('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  tableId: text('table_id').references(() => tables.id, {
    onDelete: 'set null',
  }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  status: orderStatusesEnum().default(DEFAULT_ORDER_STATUS).notNull(),
  totalPrice: integer('total_price').notNull(),
  ...timestamps,
});

export const orderItems = pgTable('order_items', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  menuItemId: text('menu_item_id')
    .notNull()
    .references(() => menuItems.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull(),
  notes: text('notes'),
  chosenOptions: json('chosen_options').default([]).notNull(),
  ...timestamps,
});

export const orderRelations = relations(orders, ({ one, many }) => ({
  store: one(stores, {
    fields: [orders.storeId],
    references: [stores.id],
  }),
  table: one(tables, {
    fields: [orders.tableId],
    references: [tables.id],
  }),
  user: one(user, {
    fields: [orders.userId],
    references: [user.id],
  }),
  items: many(orderItems),
}));

export const orderItemRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  menuItem: one(menuItems, {
    fields: [orderItems.menuItemId],
    references: [menuItems.id],
  }),
}));
