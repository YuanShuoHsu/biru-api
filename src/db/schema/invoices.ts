import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { order } from './orders';
import { refund } from './refunds';

export const invoiceTypeEnum = pgEnum('invoice_type', [
  'personal',
  'company',
  'donate',
]);
export type InvoiceType = (typeof invoiceTypeEnum.enumValues)[number];

export const invoiceCarrierTypeEnum = pgEnum('invoice_carrier_type', [
  'individual',
  'mobile',
  'certificate',
]);
export type InvoiceCarrierType =
  (typeof invoiceCarrierTypeEnum.enumValues)[number];

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'pending',
  'issuing',
  'issued',
  'voided',
]);
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];

// https://schema.org/PaymentStatusType
export const paymentStatusEnum = pgEnum('payment_status', [
  'PaymentDue',
  'PaymentPastDue',
  'PaymentComplete',
  'PaymentDeclined',
]);
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];

// https://schema.org/Invoice
export const invoice = pgTable(
  'invoice',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    type: invoiceTypeEnum('type').notNull(),
    carrierType: invoiceCarrierTypeEnum('carrier_type'),
    carrierNum: text('carrier_num'),
    email: text('email'),
    customerIdentifier: text('customer_identifier'),
    customerName: text('customer_name'),
    customerAddr: text('customer_addr'),
    donateCode: text('donate_code'),
    paymentStatus: paymentStatusEnum('payment_status')
      .notNull()
      .default('PaymentDue'),
    status: invoiceStatusEnum('status').notNull().default('pending'),
    invoiceNumber: text('invoice_number'),
    invoiceDate: timestamp('invoice_date'),
    randomNumber: text('random_number'),
    relateNumber: text('relate_number'),
    voidedAt: timestamp('voided_at'),
    printedAt: timestamp('printed_at'),
    printResetCount: integer('print_reset_count').notNull().default(0),
    printResetReason: text('print_reset_reason'),
    ...timestamps,
  },
  (table) => [
    index('invoice_orderId_idx').on(table.orderId),
    index('invoice_unissued_updatedAt_idx')
      .on(table.updatedAt)
      .where(sql`${table.status} in ('pending', 'issuing')`),
    uniqueIndex('invoice_activeOrderId_idx')
      .on(table.orderId)
      .where(sql`${table.status} <> 'voided'`),
  ],
);

export type Invoice = typeof invoice.$inferSelect;

export const invoiceAllowance = pgTable(
  'invoice_allowance',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoice.id, { onDelete: 'cascade' }),
    refundId: text('refund_id').references(() => refund.id, {
      onDelete: 'set null',
    }),
    allowanceNo: text('allowance_no').notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    remainingAmount: numeric('remaining_amount', {
      precision: 10,
      scale: 2,
    }).notNull(),
    issuedAt: timestamp('issued_at').notNull(),
    ...timestamps,
  },
  (table) => [
    index('invoiceAllowance_invoiceId_idx').on(table.invoiceId),
    uniqueIndex('invoiceAllowance_refundId_unique').on(table.refundId),
  ],
);

export type InvoiceAllowance = typeof invoiceAllowance.$inferSelect;

export const invoiceRelations = relations(invoice, ({ many, one }) => ({
  allowances: many(invoiceAllowance),
  order: one(order, {
    fields: [invoice.orderId],
    references: [order.id],
  }),
}));

export const invoiceAllowanceRelations = relations(
  invoiceAllowance,
  ({ one }) => ({
    invoice: one(invoice, {
      fields: [invoiceAllowance.invoiceId],
      references: [invoice.id],
    }),
  }),
);
