import { sql } from 'drizzle-orm';

import { authDb } from '../auth/auth-transaction';
import type { DrizzleDB } from '../drizzle/drizzle.module';

const PRE_DELETED_CHILDREN = {
  organization: [
    { table: 'invitation', column: 'organization_id' },
    { table: 'member', column: 'organization_id' },
  ],
  team: [{ table: 'team_member', column: 'team_id' }],
  user: [{ table: 'account', column: 'user_id' }],
} as const;

export const startDeletedRecordBatch = async (
  tx: Pick<DrizzleDB, 'execute'>,
) => {
  await tx.execute(
    sql`SELECT set_config('app.deleted_record_batch', (-nextval('deleted_record_batch_seq'))::text, true)`,
  );
};

const PRE_DELETED_CHILD_PAIRS = Object.entries(PRE_DELETED_CHILDREN).flatMap(
  ([parent, children]) =>
    children.map(({ table }) => ({ parent, child: table })),
);

export const isPreDeletedChild = (
  tableName: string,
  batchTables: ReadonlySet<string>,
) =>
  PRE_DELETED_CHILD_PAIRS.some(
    ({ parent, child }) => child === tableName && batchTables.has(parent),
  );

export const preDeletedChildCondition = (row: string) =>
  sql`EXISTS (
    SELECT 1 FROM deleted_record parent_row
    WHERE parent_row.batch_id = ${sql.identifier(row)}.batch_id
      AND (${sql.join(
        PRE_DELETED_CHILD_PAIRS.map(
          ({ parent, child }) =>
            sql`(${sql.identifier(row)}.table_name = ${child} AND parent_row.table_name = ${parent})`,
        ),
        sql` OR `,
      )})
  )`;

export type DeletionParent = {
  table: keyof typeof PRE_DELETED_CHILDREN;
  id: string;
};

export const latestDeletedRecordId = async (): Promise<string> => {
  const { rows } = await authDb().execute<{ id: string | null }>(
    sql`SELECT max(id)::text AS id FROM deleted_record`,
  );

  return rows[0]?.id ?? '0';
};

export const mergePreDeletedChildren = async (
  parent: DeletionParent,
  sinceId: string,
) => {
  await authDb().execute(sql`
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
