import { relations, sql } from 'drizzle-orm';
import {
  boolean,
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
    // 沒指定工作單印表機的品項印到這台；有工作單印表機時恰好一台
    isDefault: boolean('is_default').notNull().default(false),
    username: text('username').notNull().unique(),
    digestHa1: text('digest_ha1').notNull(),
    digestNonce: text('digest_nonce'),
    digestNc: integer('digest_nc'),
    lastSeenAt: timestamp('last_seen_at'),
    pollGapsMs: integer('poll_gaps_ms').array(),
    ...timestamps,
  },
  (table) => [
    index('printer_organizationId_idx').on(table.organizationId),
    uniqueIndex('printer_organizationId_invoice_idx')
      .on(table.organizationId)
      .where(sql`${table.purpose} = 'invoice'`),
    uniqueIndex('printer_organizationId_default_idx')
      .on(table.organizationId)
      .where(sql`${table.isDefault}`),
    check(
      'printer_isDefault_check',
      sql`not ${table.isDefault} or ${table.purpose} = 'orderTicket'`,
    ),
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
    // 印表機移除後保留紀錄，否則它印過的品項會被當成沒印過、補排到別台
    printerId: text('printer_id').references(() => printer.id, {
      onDelete: 'set null',
    }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    kind: orderTicketKindEnum('kind').notNull(),
    // 入列時就定下這張單負責的品項，之後改品項對應不會讓排隊中的品項落空
    orderItemIds: text('order_item_ids').array().notNull(),
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
