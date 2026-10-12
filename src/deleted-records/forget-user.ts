import { and, eq, inArray, or, sql } from 'drizzle-orm';

import { db } from '../db';
import { deletedRecord } from '../db/schema/deleted-records';

export const forgetDeletedUser = async (userId: string) => {
  const userBatches = db
    .select({ batchId: deletedRecord.batchId })
    .from(deletedRecord)
    .where(
      and(
        eq(deletedRecord.tableName, 'user'),
        eq(deletedRecord.recordId, userId),
      ),
    );

  await db
    .delete(deletedRecord)
    .where(
      or(
        inArray(deletedRecord.batchId, userBatches),
        and(
          eq(deletedRecord.tableName, 'account'),
          sql`${deletedRecord.data} ->> 'user_id' = ${userId}`,
        ),
      ),
    );
};
