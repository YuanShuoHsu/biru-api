import { APIError } from 'better-auth/api';
import { sql } from 'drizzle-orm';

import * as schema from '../db/schema/index.js';

import { authDb } from './auth-transaction.js';

const findSoleOwnerIds = async (userIds: string[]) => {
  if (!userIds.length) return new Set<string>();

  const { rows } = await authDb().execute<{ id: string }>(sql`
    SELECT DISTINCT owned.user_id AS id FROM ${schema.member} owned
    WHERE owned.user_id IN (${sql.join(
      userIds.map((id) => sql`${id}`),
      sql`, `,
    )})
      AND owned.role = 'owner'
      AND NOT EXISTS (
        SELECT 1 FROM ${schema.member} other
        WHERE other.organization_id = owned.organization_id
          AND other.role = 'owner'
          AND other.user_id <> owned.user_id
      )
  `);

  return new Set(rows.map(({ id }) => id));
};

export const assertUserDeletable = async (userId: string) => {
  const [blockedIds, soleOwnerIds] = await Promise.all([
    findBlockedIds('user', [userId]),
    findSoleOwnerIds([userId]),
  ]);

  if (blockedIds.size)
    throw new APIError('CONFLICT', {
      message: 'The user has employment records and cannot be deleted',
      code: 'USER_HAS_EMPLOYMENT_RECORDS',
    });

  if (soleOwnerIds.size)
    throw new APIError('CONFLICT', {
      message: 'The user is the only owner of an organization',
      code: 'USER_IS_SOLE_ORGANIZATION_OWNER',
    });
};

export const getDeletableUserIds = async (userIds: string[]) => {
  const [blockedIds, soleOwnerIds] = await Promise.all([
    findBlockedIds('user', userIds),
    findSoleOwnerIds(userIds),
  ]);

  return new Set(
    userIds.filter((id) => !blockedIds.has(id) && !soleOwnerIds.has(id)),
  );
};

const blockingReferences = new Map<
  string,
  Promise<{ table: string; column: string }[]>
>();

const getBlockingReferences = (parentTable: string) => {
  const cached = blockingReferences.get(parentTable);
  if (cached) return cached;

  const references = authDb()
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

const findBlockedIds = async (parentTable: string, ids: string[]) => {
  const references = await getBlockingReferences(parentTable);
  if (!references.length || !ids.length) return new Set<string>();

  const { rows } = await authDb().execute<{ id: string }>(sql`
    SELECT candidate.id FROM (
      VALUES ${sql.join(
        ids.map((id) => sql`(${id})`),
        sql`, `,
      )}
    ) AS candidate (id)
    WHERE ${sql.join(
      references.map(
        ({ table, column }) =>
          sql`EXISTS (SELECT 1 FROM ${sql.identifier(table)} WHERE ${sql.identifier(table)}.${sql.identifier(column)} = candidate.id)`,
      ),
      sql` OR `,
    )}
  `);

  return new Set(rows.map(({ id }) => id));
};

export const hasBusinessRecords = async (organizationId: string) =>
  (await findBlockedIds('organization', [organizationId])).size > 0;

export const assertOrganizationDeletable = async (organizationId: string) => {
  if (await hasBusinessRecords(organizationId))
    throw new APIError('CONFLICT', {
      message: 'The organization has business records and cannot be deleted',
      code: 'ORGANIZATION_HAS_BUSINESS_RECORDS',
    });
};
