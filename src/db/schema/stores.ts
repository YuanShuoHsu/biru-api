import {
  boolean,
  index,
  json,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

export const stores = pgTable('stores', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: json('name').default({}).notNull(),
  address: text('address').default('').notNull(),
  createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
  isActive: boolean('isActive').default(true).notNull(),
  slug: text('slug').unique().notNull(),
  updatedAt: timestamp('updatedAt', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const tables = pgTable(
  'tables',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: json('name').default({}).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    isActive: boolean('isActive').default(true).notNull(),
    slug: text('slug').notNull(),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      storeIdSlugUnique: unique().on(table.storeId, table.slug),
      storeIdIdx: index('tables_store_id_idx').on(table.storeId),
    };
  },
);
