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
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { order } from './orders';
import { user } from './users';

export const refundScopeEnum = pgEnum('refund_scope', ['full', 'partial']);
export type RefundScope = (typeof refundScopeEnum.enumValues)[number];

export const refundChannelEnum = pgEnum('refund_channel', ['ecpay', 'manual']);
export type RefundChannel = (typeof refundChannelEnum.enumValues)[number];

export const refundStatusEnum = pgEnum('refund_status', [
  'pending',
  'refunded',
  'settling',
  'settled',
]);
export type RefundStatus = (typeof refundStatusEnum.enumValues)[number];

export const refundInvoiceActionEnum = pgEnum('refund_invoice_action', [
  'none',
  'voided',
  'allowance',
  'failed',
]);
export type RefundInvoiceAction =
  (typeof refundInvoiceActionEnum.enumValues)[number];

export interface RefundItemSnapshot {
  amount: string;
  menuItemName: string;
  orderItemId: string;
  quantity: number;
  unitPrice: string;
}

export const refund = pgTable(
  'refund',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    scope: refundScopeEnum('scope').notNull(),
    channel: refundChannelEnum('channel').notNull(),
    items: jsonb('items').$type<RefundItemSnapshot[]>(),
    status: refundStatusEnum('status').notNull().default('pending'),
    ecpayRtnCode: text('ecpay_rtn_code'),
    ecpayRtnMsg: text('ecpay_rtn_msg'),
    invoiceAction: refundInvoiceActionEnum('invoice_action'),
    invoiceError: text('invoice_error'),
    invoiceRetryAt: timestamp('invoice_retry_at'),
    invoiceAttempts: integer('invoice_attempts').notNull().default(0),
    allowanceNo: text('allowance_no'),
    operatorId: text('operator_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    reason: text('reason'),
    ...timestamps,
  },
  (table) => [
    index('refund_orderId_idx').on(table.orderId),
    index('refund_invoiceRetryAt_idx')
      .on(table.invoiceRetryAt)
      .where(sql`${table.invoiceAction} = 'failed'`),
    index('refund_pending_createdAt_idx')
      .on(table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    index('refund_unsettled_updatedAt_idx')
      .on(table.updatedAt)
      .where(sql`${table.status} in ('refunded', 'settling')`),
  ],
);

export type Refund = typeof refund.$inferSelect;

export const refundRelations = relations(refund, ({ one }) => ({
  operator: one(user, {
    fields: [refund.operatorId],
    references: [user.id],
  }),
  order: one(order, {
    fields: [refund.orderId],
    references: [order.id],
  }),
}));
