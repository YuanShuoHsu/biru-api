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
]);
export type PointTransactionType =
  (typeof pointTransactionTypeEnum.enumValues)[number];

export const pointTransaction = pgTable(
  'point_transaction',
  {
    id: text('id').primaryKey(),
    // earn 的到期日；null = 永久有效
    expiresAt: timestamp('expires_at'),
    orderId: text('order_id').references(() => order.id, {
      onDelete: 'set null',
    }),
    // earn 的入點店家；redeem 屬品牌層，為 null
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    // earn 為正、redeem 為負
    points: integer('points').notNull(),
    // earn 尚未被兌換消耗的點數（FIFO 扣點用）；redeem 恆為 0
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
    // 每張訂單只入點一次（lazy 補入的冪等鍵）
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
