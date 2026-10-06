import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { languagesEnum } from './enums';
import { organization } from './organizations';
import { user } from './users';

export interface WaitlistGroup {
  maxPartySize: number;
  minPartySize: number;
  prefix: string;
}

export const waitlistSetting = pgTable('waitlist_setting', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  paused: boolean('paused').notNull().default(false),
  holdMinutes: integer('hold_minutes').notNull().default(10),
  cutoffMinutes: integer('cutoff_minutes').notNull().default(60),
  groups: jsonb('groups').$type<WaitlistGroup[]>().notNull().default([]),
  ...timestamps,
});

export type WaitlistSetting = typeof waitlistSetting.$inferSelect;

export const WAITLIST_ACTIVE_STATUSES = ['waiting', 'called'] as const;
export const WAITLIST_ENDED_STATUSES = [
  'seated',
  'noShow',
  'cancelled',
] as const;
export const waitlistTicketStatusEnum = pgEnum('waitlist_ticket_status', [
  ...WAITLIST_ACTIVE_STATUSES,
  ...WAITLIST_ENDED_STATUSES,
]);
export type WaitlistTicketStatus =
  (typeof waitlistTicketStatusEnum.enumValues)[number];

export const waitlistTicket = pgTable(
  'waitlist_ticket',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    serviceDate: date('service_date').notNull(),
    prefix: text('prefix').notNull(),
    number: integer('number').notNull(),
    partySize: integer('party_size').notNull(),
    name: text('name').notNull(),
    phoneNumber: text('phone_number').notNull(),
    email: text('email'),
    locale: languagesEnum('locale').notNull(),
    status: waitlistTicketStatusEnum('status').notNull().default('waiting'),
    idempotencyKey: text('idempotency_key'),
    calledAt: timestamp('called_at'),
    confirmedAt: timestamp('confirmed_at'),
    endedAt: timestamp('ended_at'),
    userId: text('user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('waitlist_ticket_number_unique').on(
      table.organizationId,
      table.serviceDate,
      table.prefix,
      table.number,
    ),
    uniqueIndex('waitlist_ticket_active_phone_unique')
      .on(table.organizationId, table.serviceDate, table.phoneNumber)
      .where(sql`${table.status} in ('waiting', 'called')`),
    uniqueIndex('waitlist_ticket_idempotencyKey_unique').on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index('waitlist_ticket_status_idx').on(table.status, table.serviceDate),
    check('waitlist_ticket_party_size_positive', sql`${table.partySize} > 0`),
  ],
);

export type WaitlistTicket = typeof waitlistTicket.$inferSelect;
