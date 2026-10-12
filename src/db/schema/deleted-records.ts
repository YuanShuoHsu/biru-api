// https://brandur.org/soft-deletion

import {
  bigint,
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const deletedRecord = pgTable(
  'deleted_record',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    batchId: bigint('batch_id', { mode: 'number' }).notNull(),
    tableName: text('table_name').notNull(),
    recordId: text('record_id'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    deletedAt: timestamp('deleted_at').defaultNow().notNull(),
  },
  (table) => [
    index('deletedRecord_batchId_idx').on(table.batchId),
    index('deletedRecord_deletedAt_idx').on(table.deletedAt),
  ],
);
