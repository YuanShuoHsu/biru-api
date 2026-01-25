import {
  boolean,
  index,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { user } from './users';

export const posts = pgTable(
  'posts',
  {
    id: serial('id').primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id),
    content: text('content'),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    published: boolean('published').default(false).notNull(),
    title: text('title').notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      authorIdIdx: index('posts_author_id_idx').on(table.authorId),
    };
  },
);
