import { APIError } from 'better-auth/api';
import { sql } from 'drizzle-orm';

import { db } from '../db';
import * as schema from '../db/schema';

export const assertUserDeletable = async (userId: string) => {
  if (await hasBlockingRecords('user', userId))
    throw new APIError('CONFLICT', {
      message: 'The user has employment records and cannot be deleted',
      code: 'USER_HAS_EMPLOYMENT_RECORDS',
    });

  const { rows: soleOwned } = await db.execute(sql`
    SELECT 1 FROM ${schema.member} owned
    WHERE owned.user_id = ${userId}
      AND owned.role = 'owner'
      AND NOT EXISTS (
        SELECT 1 FROM ${schema.member} other
        WHERE other.organization_id = owned.organization_id
          AND other.role = 'owner'
          AND other.user_id <> owned.user_id
      )
    LIMIT 1
  `);

  if (soleOwned.length)
    throw new APIError('CONFLICT', {
      message: 'The user is the only owner of an organization',
      code: 'USER_IS_SOLE_ORGANIZATION_OWNER',
    });
};

const blockingReferences = new Map<
  string,
  Promise<{ table: string; column: string }[]>
>();

const getBlockingReferences = (parentTable: string) => {
  const cached = blockingReferences.get(parentTable);
  if (cached) return cached;

  const references = db
    .execute<{ table: string; column: string }>(
      sql`
        SELECT child.relname AS "table", a.attname AS "column"
        FROM pg_constraint c
        JOIN pg_class child ON child.oid = c.conrelid
        JOIN pg_class parent ON parent.oid = c.confrelid
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f'
          AND c.connamespace = 'public'::regnamespace
          AND parent.relname = ${parentTable}
          AND c.confdeltype IN ('r', 'a')
      `,
    )
    .then(({ rows }) => rows)
    .catch((error: unknown) => {
      blockingReferences.delete(parentTable);
      throw error;
    });
  blockingReferences.set(parentTable, references);

  return references;
};

const hasBlockingRecords = async (parentTable: string, id: string) => {
  const references = await getBlockingReferences(parentTable);
  if (!references.length) return false;

  const { rows } = await db.execute(sql`
    SELECT 1 FROM (
      ${sql.join(
        references.map(
          ({ table, column }) =>
            sql`(SELECT 1 FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} = ${id} LIMIT 1)`,
        ),
        sql` UNION ALL `,
      )}
    ) AS blocking
    LIMIT 1
  `);

  return rows.length > 0;
};

export const hasBusinessRecords = (organizationId: string) =>
  hasBlockingRecords('organization', organizationId);

export const assertOrganizationDeletable = async (organizationId: string) => {
  if (await hasBusinessRecords(organizationId))
    throw new APIError('CONFLICT', {
      message: 'The organization has business records and cannot be deleted',
      code: 'ORGANIZATION_HAS_BUSINESS_RECORDS',
    });
};
