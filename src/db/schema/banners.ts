import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers.js';
import type { LocalizedText } from './enums.js';

export const banner = pgTable('banner', {
  id: text('id').primaryKey(),
  image: text('image').notNull(),
  alt: jsonb('alt').$type<LocalizedText>(),
  url: text('url'),
  isActive: boolean('is_active').notNull().default(true),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export type Banner = typeof banner.$inferSelect;
