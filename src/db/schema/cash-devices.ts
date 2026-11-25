import {
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers.js';
import { organization } from './organizations.js';
import { user } from './users.js';

export const cashDeviceStatusEnum = pgEnum('cash_device_status', [
  'active',
  'inactive',
]);
export type CashDeviceStatus = (typeof cashDeviceStatusEnum.enumValues)[number];

export const cashDevice = pgTable(
  'cash_device',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    vendor: text('vendor'),
    model: text('model'),
    status: cashDeviceStatusEnum('status').notNull().default('active'),
    lastSeenAt: timestamp('last_seen_at'),
    ...timestamps,
  },
  (table) => [index('cashDevice_organizationId_idx').on(table.organizationId)],
);

export type CashDevice = typeof cashDevice.$inferSelect;

export const cashDeviceEventTypeEnum = pgEnum('cash_device_event_type', [
  'payment',
  'change',
  'refundDispense',
  'refill',
  'collection',
  'inventorySnapshot',
  'error',
]);
export type CashDeviceEventType =
  (typeof cashDeviceEventTypeEnum.enumValues)[number];

export type CashDenominations = Record<string, number>;

export const cashDeviceEvent = pgTable(
  'cash_device_event',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    deviceId: text('device_id')
      .notNull()
      .references(() => cashDevice.id, { onDelete: 'restrict' }),
    type: cashDeviceEventTypeEnum('type').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    denominations: jsonb('denominations')
      .$type<CashDenominations>()
      .notNull()
      .default({}),
    amount: numeric('amount', { precision: 10, scale: 2 }),
    reportedAmount: numeric('reported_amount', { precision: 10, scale: 2 }),
    depositedAmount: numeric('deposited_amount', { precision: 10, scale: 2 }),
    note: text('note'),
    createdBy: text('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    occurredAt: timestamp('occurred_at').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('cashDeviceEvent_deviceId_idempotencyKey_idx').on(
      table.deviceId,
      table.idempotencyKey,
    ),
    index('cashDeviceEvent_deviceId_occurredAt_idx').on(
      table.deviceId,
      table.occurredAt,
    ),
    index('cashDeviceEvent_organizationId_occurredAt_idx').on(
      table.organizationId,
      table.occurredAt,
    ),
    index('cashDeviceEvent_createdBy_idx').on(table.createdBy),
  ],
);

export type CashDeviceEvent = typeof cashDeviceEvent.$inferSelect;
