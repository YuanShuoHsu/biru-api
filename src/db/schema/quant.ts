import { index, pgTable, text } from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { user } from './users';

export const quantCredential = pgTable(
  'quant_credential',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    apiKeyLast4: text('api_key_last4').notNull(),
    encryptedApiKey: text('encrypted_api_key').notNull(),
    encryptedApiSecret: text('encrypted_api_secret').notNull(),
    ...timestamps,
  },
  (table) => [index('quant_credential_user_id_idx').on(table.userId)],
);

export type QuantCredential = typeof quantCredential.$inferSelect;
