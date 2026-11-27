import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers.js';
import { order, orderItem } from './orders.js';
import { organization } from './organizations.js';
import { user } from './users.js';

export const orderReview = pgTable(
  'order_review',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .unique()
      .references(() => order.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    rating: smallint('rating').notNull(),
    comment: text('comment'),
    reply: text('reply'),
    repliedAt: timestamp('replied_at'),
    repliedBy: text('replied_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('orderReview_organizationId_createdAt_idx').on(
      table.organizationId,
      table.createdAt,
    ),
    index('orderReview_userId_idx').on(table.userId),
    check('order_review_rating_check', sql`${table.rating} BETWEEN 1 AND 5`),
  ],
);

export type OrderReview = typeof orderReview.$inferSelect;

export const orderReviewItem = pgTable(
  'order_review_item',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => orderReview.id, { onDelete: 'cascade' }),
    orderItemId: text('order_item_id')
      .notNull()
      .references(() => orderItem.id, { onDelete: 'cascade' }),
    liked: boolean('liked').notNull(),
  },
  (table) => [
    uniqueIndex('orderReviewItem_reviewId_orderItemId_uidx').on(
      table.reviewId,
      table.orderItemId,
    ),
    index('orderReviewItem_orderItemId_idx').on(table.orderItemId),
  ],
);

export const orderReviewRelations = relations(orderReview, ({ many }) => ({
  items: many(orderReviewItem),
}));

export const orderReviewItemRelations = relations(
  orderReviewItem,
  ({ one }) => ({
    review: one(orderReview, {
      fields: [orderReviewItem.reviewId],
      references: [orderReview.id],
    }),
  }),
);
