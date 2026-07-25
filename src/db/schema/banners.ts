import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';

export const banner = pgTable('banner', {
  id: text('id').primaryKey(),
  image: text('image').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export type Banner = typeof banner.$inferSelect;
