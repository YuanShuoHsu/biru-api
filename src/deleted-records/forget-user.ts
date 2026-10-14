import { and, eq, inArray } from 'drizzle-orm';

import { authDb } from '../auth/auth-transaction';
import { deletedRecord } from '../db/schema/deleted-records';

export const forgetDeletedUser = async (userId: string) => {
  const database = authDb();
  const userBatches = database
    .select({ batchId: deletedRecord.batchId })
    .from(deletedRecord)
    .where(
      and(
        eq(deletedRecord.tableName, 'user'),
        eq(deletedRecord.recordId, userId),
      ),
    );

  await database
    .delete(deletedRecord)
    .where(inArray(deletedRecord.batchId, userBatches));
};
