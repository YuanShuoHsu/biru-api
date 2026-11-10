import { boolean, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers.js';
import { type LocalizedText } from './enums.js';

export const storePhoto = pgTable('store_photo', {
  id: text('id').primaryKey(),
  image: text('image').notNull(),
  alt: jsonb('alt').notNull().$type<LocalizedText>(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export type StorePhoto = typeof storePhoto.$inferSelect;
