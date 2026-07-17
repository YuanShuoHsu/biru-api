import { relations, sql } from 'drizzle-orm';
import {
  boolean,
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
import { user } from './users';

export const couponDiscountTypeEnum = pgEnum('coupon_discount_type', [
  'fixed',
  'percentage',
]);
export type CouponDiscountType =
  (typeof couponDiscountTypeEnum.enumValues)[number];

export const couponScopeEnum = pgEnum('coupon_scope', ['order', 'item']);
export type CouponScope = (typeof couponScopeEnum.enumValues)[number];

export const couponIssueTriggerEnum = pgEnum('coupon_issue_trigger', [
  'signup',
  'birthday',
  'spend',
]);
export type CouponIssueTrigger =
  (typeof couponIssueTriggerEnum.enumValues)[number];

export const userCouponSourceEnum = pgEnum('user_coupon_source', [
  'granted',
  'claimed',
  'signup',
  'birthday',
  'spend',
  'redeemed',
]);
export type UserCouponSource = (typeof userCouponSourceEnum.enumValues)[number];

export const coupon = pgTable(
  'coupon',
  {
    id: text('id').primaryKey(),
    // 適用店家；null = 全部店家通用
    applicableOrganizationIds: text('applicable_organization_ids').array(),
    code: text('code').notNull(),
    discountCurrency: text('discount_currency').notNull().default('TWD'),
    discountType: couponDiscountTypeEnum('discount_type').notNull(),
    discountValue: numeric('discount_value', {
      precision: 10,
      scale: 2,
    }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    isClaimable: boolean('is_claimable').notNull().default(false),
    isPublic: boolean('is_public').notNull().default(false),
    issueMinSpend: numeric('issue_min_spend', { precision: 10, scale: 2 }),
    issueTrigger: couponIssueTriggerEnum('issue_trigger'),
    menuItemIds: text('menu_item_ids').array(),
    menuSectionIds: text('menu_section_ids').array(),
    minSubtotal: numeric('min_subtotal', { precision: 10, scale: 2 }),
    perUserLimit: integer('per_user_limit'),
    // 兌換所需點數；null = 不可用點數兌換
    pointsCost: integer('points_cost'),
    scope: couponScopeEnum('scope').notNull().default('order'),
    totalLimit: integer('total_limit'),
    usedCount: integer('used_count').notNull().default(0),
    validFrom: timestamp('valid_from'),
    validThrough: timestamp('valid_through'),
    ...timestamps,
  },
  (table) => [uniqueIndex('coupon_code_unique').on(sql`lower(${table.code})`)],
);

export type Coupon = typeof coupon.$inferSelect;

export const userCoupon = pgTable(
  'user_coupon',
  {
    id: text('id').primaryKey(),
    couponId: text('coupon_id')
      .notNull()
      .references(() => coupon.id, { onDelete: 'cascade' }),
    orderId: text('order_id').references(() => order.id, {
      onDelete: 'set null',
    }),
    source: userCouponSourceEnum('source').notNull(),
    usedAt: timestamp('used_at'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    index('userCoupon_userId_couponId_idx').on(table.userId, table.couponId),
    // 領取與註冊禮每人每券限一張；granted 可重複補發、birthday 每年重發、spend 可累積
    uniqueIndex('userCoupon_couponId_userId_source_unique')
      .on(table.couponId, table.userId, table.source)
      .where(sql`"source" IN ('claimed', 'signup')`),
  ],
);

export type UserCoupon = typeof userCoupon.$inferSelect;

export const couponRelations = relations(coupon, ({ many }) => ({
  userCoupons: many(userCoupon),
}));

export const userCouponRelations = relations(userCoupon, ({ one }) => ({
  coupon: one(coupon, {
    fields: [userCoupon.couponId],
    references: [coupon.id],
  }),
  user: one(user, {
    fields: [userCoupon.userId],
    references: [user.id],
  }),
}));
