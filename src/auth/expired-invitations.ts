import { and, eq, lte, sql } from 'drizzle-orm';

import * as schema from '../db/schema/index.js';

import { authDb } from './auth-transaction.js';

// better-auth 找既有邀請時會略過已過期的，它們留在 pending 會讓新邀請撞上 pending 的唯一索引
export const cancelExpiredInvitations = (
  organizationId: string,
  email: string,
) =>
  authDb()
    .update(schema.invitation)
    .set({ status: 'canceled' })
    .where(
      and(
        eq(schema.invitation.organizationId, organizationId),
        sql`lower(${schema.invitation.email}) = lower(${email})`,
        eq(schema.invitation.status, 'pending'),
        lte(schema.invitation.expiresAt, new Date()),
      ),
    );
