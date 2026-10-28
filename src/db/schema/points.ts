import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers.js';
import { userCoupon } from './coupons.js';
import { order } from './orders.js';
import { organization } from './organizations.js';
import { user } from './users.js';

export const pointTransactionTypeEnum = pgEnum('point_transaction_type', [
  'earn',
  'redeem',
  'revoke',
  'adjust',
]);
export type PointTransactionType =
  (typeof pointTransactionTypeEnum.enumValues)[number];

export const pointTransaction = pgTable(
  'point_transaction',
  {
    id: text('id').primaryKey(),
    adjustedBy: text('adjusted_by'),
    expiresAt: timestamp('expires_at'),
    orderId: text('order_id').references(() => order.id, {
      onDelete: 'set null',
    }),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    note: text('note'),
    points: integer('points').notNull(),
    remainingPoints: integer('remaining_points').notNull().default(0),
    type: pointTransactionTypeEnum('type').notNull(),
    userCouponId: text('user_coupon_id').references(() => userCoupon.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    index('pointTransaction_userId_organizationId_idx').on(
      table.userId,
      table.organizationId,
    ),
    index('pointTransaction_organizationId_createdAt_idx').on(
      table.organizationId,
      table.createdAt,
    ),
    uniqueIndex('pointTransaction_orderId_earn_unique')
      .on(table.orderId)
      .where(sql`"type" = 'earn'`),
  ],
);

export type PointTransaction = typeof pointTransaction.$inferSelect;

export const POINT_SETTING_ID = 'brand';

export const pointSetting = pgTable(
  'point_setting',
  {
    id: text('id').primaryKey().default(POINT_SETTING_ID),
    amountPerPoint: numeric('amount_per_point', { precision: 10, scale: 2 }),
    pointsValidityYears: integer('points_validity_years'),
    pointsEnabledAt: timestamp('points_enabled_at'),
    accountingValuePerPoint: numeric('accounting_value_per_point', {
      precision: 10,
      scale: 2,
    }),
    ...timestamps,
  },
  (table) => [check('point_setting_single_row', sql`${table.id} = 'brand'`)],
);

export type PointSetting = typeof pointSetting.$inferSelect;

export const pointTransactionRelations = relations(
  pointTransaction,
  ({ one }) => ({
    order: one(order, {
      fields: [pointTransaction.orderId],
      references: [order.id],
    }),
    organization: one(organization, {
      fields: [pointTransaction.organizationId],
      references: [organization.id],
    }),
    user: one(user, {
      fields: [pointTransaction.userId],
      references: [user.id],
    }),
    userCoupon: one(userCoupon, {
      fields: [pointTransaction.userCouponId],
      references: [userCoupon.id],
    }),
  }),
);
