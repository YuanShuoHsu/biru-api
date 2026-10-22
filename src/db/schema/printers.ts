import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers.js';
import { order } from './orders.js';
import { organization } from './organizations.js';
import { refund } from './refunds.js';

export const printerPurposeEnum = pgEnum('printer_purpose', [
  'invoice',
  'orderTicket',
]);
export type PrinterPurpose = (typeof printerPurposeEnum.enumValues)[number];

export const printCopyEnum = pgEnum('print_copy', ['original', 'reprint']);
export type PrintCopy = (typeof printCopyEnum.enumValues)[number];

export const printJobStatusEnum = pgEnum('print_job_status', [
  'queued',
  'sent',
  'printed',
  'unknown',
  'cancelled',
]);
export type PrintJobStatus = (typeof printJobStatusEnum.enumValues)[number];

export const printer = pgTable(
  'printer',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    purpose: printerPurposeEnum('purpose').notNull(),
    name: text('name'),
    username: text('username').notNull().unique(),
    digestHa1: text('digest_ha1').notNull(),
    lastSeenAt: timestamp('last_seen_at'),
    pollGapsMs: integer('poll_gaps_ms').array(),
    ...timestamps,
  },
  (table) => [
    index('printer_organizationId_idx').on(table.organizationId),
    uniqueIndex('printer_organizationId_invoice_idx')
      .on(table.organizationId)
      .where(sql`${table.purpose} = 'invoice'`),
  ],
);

export type Printer = typeof printer.$inferSelect;

export const orderTicketKindEnum = pgEnum('order_ticket_kind', [
  'order',
  'refund',
]);
export type OrderTicketKind = (typeof orderTicketKindEnum.enumValues)[number];

export const orderTicketJob = pgTable(
  'order_ticket_job',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    refundId: text('refund_id').references(() => refund.id, {
      onDelete: 'cascade',
    }),
    printerId: text('printer_id')
      .notNull()
      .references(() => printer.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    kind: orderTicketKindEnum('kind').notNull(),
    copy: printCopyEnum('copy').notNull(),
    status: printJobStatusEnum('status').notNull().default('queued'),
    errorCode: text('error_code'),
    sentAt: timestamp('sent_at'),
    finishedAt: timestamp('finished_at'),
    ...timestamps,
  },
  (table) => [
    index('orderTicketJob_orderId_idx').on(table.orderId),
    index('orderTicketJob_printerId_status_idx').on(
      table.printerId,
      table.status,
    ),
    // 同一台印表機同時只能有一份正本在途，否則兩份都可能印出來、吧台做兩份
    uniqueIndex('orderTicketJob_inFlightOrder_idx')
      .on(table.orderId, table.printerId)
      .where(
        sql`${table.kind} = 'order' and ${table.copy} = 'original' and ${table.status} in ('queued', 'sent', 'unknown')`,
      ),
    uniqueIndex('orderTicketJob_inFlightRefund_idx')
      .on(table.refundId, table.printerId)
      .where(
        sql`${table.kind} = 'refund' and ${table.copy} = 'original' and ${table.status} in ('queued', 'sent', 'unknown')`,
      ),
    check(
      'orderTicketJob_refundId_check',
      sql`(${table.kind} = 'refund') = (${table.refundId} is not null)`,
    ),
  ],
);

export type OrderTicketJob = typeof orderTicketJob.$inferSelect;

export const orderTicketJobRelations = relations(orderTicketJob, ({ one }) => ({
  order: one(order, {
    fields: [orderTicketJob.orderId],
    references: [order.id],
  }),
  printer: one(printer, {
    fields: [orderTicketJob.printerId],
    references: [printer.id],
  }),
  refund: one(refund, {
    fields: [orderTicketJob.refundId],
    references: [refund.id],
  }),
}));
