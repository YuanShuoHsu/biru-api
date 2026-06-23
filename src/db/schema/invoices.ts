import { relations } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { order } from './orders';

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
      .unique()
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
    ...timestamps,
  },
  (table) => [index('invoice_orderId_idx').on(table.orderId)],
);

export type Invoice = typeof invoice.$inferSelect;

export const invoiceRelations = relations(invoice, ({ one }) => ({
  order: one(order, {
    fields: [invoice.orderId],
    references: [order.id],
  }),
}));
