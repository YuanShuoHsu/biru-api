import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { order } from './orders';
import { user } from './users';

export const refundScopeEnum = pgEnum('refund_scope', ['full', 'partial']);
export type RefundScope = (typeof refundScopeEnum.enumValues)[number];

export const refundChannelEnum = pgEnum('refund_channel', ['ecpay', 'manual']);
export type RefundChannel = (typeof refundChannelEnum.enumValues)[number];

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
    // 部分退款退了哪些品項與數量；全額退款為 null
    items: jsonb('items').$type<RefundItemSnapshot[]>(),
    ecpayRtnCode: text('ecpay_rtn_code'),
    ecpayRtnMsg: text('ecpay_rtn_msg'),
    // 錢已退但發票處理失敗時仍要留下紀錄，故與退款結果分欄
    invoiceAction: refundInvoiceActionEnum('invoice_action')
      .notNull()
      .default('none'),
    invoiceError: text('invoice_error'),
    operatorId: text('operator_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    reason: text('reason'),
    ...timestamps,
  },
  (table) => [index('refund_orderId_idx').on(table.orderId)],
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
