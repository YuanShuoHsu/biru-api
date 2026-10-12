import { and, eq, inArray } from 'drizzle-orm';

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
    .where(inArray(deletedRecord.batchId, userBatches));
};
