import { and, eq, inArray } from 'drizzle-orm';

import * as schema from '../db/schema/index.js';
import { startDeletedRecordBatch } from '../deleted-records/request-batch.js';

import { authDb } from './auth-transaction.js';

export const removeRevokedPlatformAdminMemberships = async (userId: string) => {
  const user = await authDb().query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { role: true },
  });
  if (!user || user.role === 'admin') return [];

  return authDb().transaction(async (tx) => {
    const memberships = await tx.query.member.findMany({
      where: and(
        eq(schema.member.userId, userId),
        eq(schema.member.joinedAsPlatformAdmin, true),
      ),
    });

    for (const { id, organizationId } of memberships) {
      await startDeletedRecordBatch(tx);
      await tx.delete(schema.member).where(eq(schema.member.id, id));
      await tx
        .delete(schema.teamMember)
        .where(
          and(
            eq(schema.teamMember.userId, userId),
            inArray(
              schema.teamMember.teamId,
              tx
                .select({ id: schema.team.id })
                .from(schema.team)
                .where(eq(schema.team.organizationId, organizationId)),
            ),
          ),
        );
    }

    return memberships;
  });
};
