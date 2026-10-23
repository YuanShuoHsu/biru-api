import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
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

export const cashDrawerSessionStatusEnum = pgEnum(
  'cash_drawer_session_status',
  ['open', 'closed'],
);
export type CashDrawerSessionStatus =
  (typeof cashDrawerSessionStatusEnum.enumValues)[number];

export const cashDrawerMovementTypeEnum = pgEnum('cash_drawer_movement_type', [
  'payIn',
  'payOut',
]);
export type CashDrawerMovementType =
  (typeof cashDrawerMovementTypeEnum.enumValues)[number];

export const cashDrawerSetting = pgTable(
  'cash_drawer_setting',
  {
    organizationId: text('organization_id')
      .primaryKey()
      .references(() => organization.id, { onDelete: 'cascade' }),
    handoverEnabled: boolean('handover_enabled').notNull().default(false),
    varianceTolerance: numeric('variance_tolerance', {
      precision: 10,
      scale: 2,
    })
      .notNull()
      .default('0'),
    ...timestamps,
  },
  (table) => [
    check(
      'cash_drawer_setting_variance_tolerance_non_negative',
      sql`${table.varianceTolerance} >= 0`,
    ),
  ],
);

export type CashDrawerSetting = typeof cashDrawerSetting.$inferSelect;

export const cashDrawerSession = pgTable(
  'cash_drawer_session',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    businessDate: date('business_date').notNull(),
    status: cashDrawerSessionStatusEnum('status').notNull().default('open'),
    openedAt: timestamp('opened_at').defaultNow().notNull(),
    openedBy: text('opened_by').notNull(),
    openingFloat: numeric('opening_float', {
      precision: 10,
      scale: 2,
    }).notNull(),
    closedAt: timestamp('closed_at'),
    closedBy: text('closed_by'),
    countedCash: numeric('counted_cash', { precision: 10, scale: 2 }),
    denominations: jsonb('denominations').$type<Record<string, number>>(),
    expectedCash: numeric('expected_cash', { precision: 10, scale: 2 }),
    retainedFloat: numeric('retained_float', { precision: 10, scale: 2 }),
    varianceNote: text('variance_note'),
    reviewedAt: timestamp('reviewed_at'),
    reviewedBy: text('reviewed_by'),
    reviewNote: text('review_note'),
    ...timestamps,
  },
  (table) => [
    index('cashDrawerSession_organizationId_businessDate_idx').on(
      table.organizationId,
      table.businessDate,
    ),
    uniqueIndex('cash_drawer_session_open_unique')
      .on(table.organizationId)
      .where(sql`${table.status} = 'open'`),
    check(
      'cash_drawer_session_opening_float_non_negative',
      sql`${table.openingFloat} >= 0`,
    ),
    check(
      'cash_drawer_session_counted_cash_non_negative',
      sql`${table.countedCash} >= 0`,
    ),
    check(
      'cash_drawer_session_closed_complete',
      sql`${table.status} = 'open' or (${table.closedAt} is not null and ${table.closedBy} is not null and ${table.countedCash} is not null and ${table.expectedCash} is not null and ${table.retainedFloat} is not null)`,
    ),
    check(
      'cash_drawer_session_review_complete',
      sql`${table.reviewedAt} is null or (${table.status} = 'closed' and ${table.reviewedBy} is not null)`,
    ),
    check(
      'cash_drawer_session_retained_float_within_counted',
      sql`${table.retainedFloat} >= 0 and ${table.retainedFloat} <= ${table.countedCash}`,
    ),
  ],
);

export type CashDrawerSession = typeof cashDrawerSession.$inferSelect;

export const cashDrawerMovement = pgTable(
  'cash_drawer_movement',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => cashDrawerSession.id, { onDelete: 'restrict' }),
    type: cashDrawerMovementTypeEnum('type').notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    reason: text('reason').notNull(),
    createdBy: text('created_by').notNull(),
    ...timestamps,
  },
  (table) => [
    index('cashDrawerMovement_sessionId_idx').on(table.sessionId),
    check('cash_drawer_movement_amount_positive', sql`${table.amount} > 0`),
  ],
);

export type CashDrawerMovement = typeof cashDrawerMovement.$inferSelect;
