import { sql } from 'drizzle-orm';

import { db } from '../db';
import type { DrizzleDB } from '../drizzle/drizzle.module';

// better-auth 刪帳號先刪 account、刪組織先刪 member 與 invitation，各自不在同一個交易，
// 所以刪除成功後要把同一請求留存的子列併進父列的批次，還原時才會一起回來
const PRE_DELETED_CHILDREN = {
  organization: [
    { table: 'invitation', column: 'organization_id' },
    { table: 'member', column: 'organization_id' },
  ],
  user: [{ table: 'account', column: 'user_id' }],
} as const;

// 同一交易刪除的列預設會共用 txid 成為同一批，批次刪除要讓每筆各自還原就得在每筆之前換批號
export const startDeletedRecordBatch = async (
  tx: Pick<DrizzleDB, 'execute'>,
) => {
  await tx.execute(
    sql`SELECT set_config('app.deleted_record_batch', (-nextval('deleted_record_batch_seq'))::text, true)`,
  );
};

export type DeletionParent = {
  table: keyof typeof PRE_DELETED_CHILDREN;
  id: string;
};

export const latestDeletedRecordId = async (): Promise<string> => {
  const { rows } = await db.execute<{ id: string | null }>(
    sql`SELECT max(id)::text AS id FROM deleted_record`,
  );

  return rows[0]?.id ?? '0';
};

export const mergePreDeletedChildren = async (
  parent: DeletionParent,
  sinceId: string,
) => {
  await db.execute(sql`
    UPDATE deleted_record child
    SET batch_id = parent.batch_id
    FROM (
      SELECT batch_id FROM deleted_record
      WHERE id > ${sinceId}::bigint
        AND table_name = ${parent.table}
        AND record_id = ${parent.id}
      ORDER BY id
      LIMIT 1
    ) parent
    WHERE child.id > ${sinceId}::bigint
      AND child.batch_id <> parent.batch_id
      AND (${sql.join(
        PRE_DELETED_CHILDREN[parent.table].map(
          ({ table, column }) =>
            sql`(child.table_name = ${table} AND child.data ->> ${column} = ${parent.id})`,
        ),
        sql` OR `,
      )})
  `);
};
