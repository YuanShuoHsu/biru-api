import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { userCoupon } from './coupons';
import { order } from './orders';
import { organization } from './organizations';
import { user } from './users';

export const pointTransactionTypeEnum = pgEnum('point_transaction_type', [
  'earn',
  'redeem',
  'revoke',
]);
export type PointTransactionType =
  (typeof pointTransactionTypeEnum.enumValues)[number];

export const pointTransaction = pgTable(
  'point_transaction',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at'),
    orderId: text('order_id').references(() => order.id, {
      onDelete: 'set null',
    }),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
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
    uniqueIndex('pointTransaction_orderId_earn_unique')
      .on(table.orderId)
      .where(sql`"type" = 'earn'`),
  ],
);

export type PointTransaction = typeof pointTransaction.$inferSelect;

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
