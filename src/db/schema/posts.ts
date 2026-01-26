import { relations } from 'drizzle-orm';
import { boolean, index, pgTable, serial, text } from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { user } from './users';

export const posts = pgTable(
  'posts',
  {
    id: serial('id').primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id),
    content: text('content'),
    published: boolean('published').default(false).notNull(),
    title: text('title').notNull(),
    ...timestamps,
  },
  (table) => [index('posts_author_id_idx').on(table.authorId)],
);

export const postRelations = relations(posts, ({ one }) => ({
  author: one(user, {
    fields: [posts.authorId],
    references: [user.id],
  }),
}));
