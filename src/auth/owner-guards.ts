import { APIError } from 'better-auth/api';
import { and, eq, ne } from 'drizzle-orm';

import * as schema from '../db/schema/index.js';

import { authDb } from './auth-transaction.js';

export const assertKeepsOwner = async (memberId: string) => {
  const target = await authDb().query.member.findFirst({
    where: eq(schema.member.id, memberId),
    columns: { joinedAsPlatformAdmin: true, organizationId: true, role: true },
  });
  if (!target || target.role !== 'owner' || target.joinedAsPlatformAdmin)
    return;

  const otherOwner = await authDb().query.member.findFirst({
    where: and(
      eq(schema.member.organizationId, target.organizationId),
      eq(schema.member.role, 'owner'),
      eq(schema.member.joinedAsPlatformAdmin, false),
      ne(schema.member.id, memberId),
    ),
    columns: { id: true },
  });
  if (!otherOwner)
    throw new APIError('BAD_REQUEST', {
      message:
        'The organization must keep an owner who did not join as a platform admin',
      code: 'ORGANIZATION_REQUIRES_AN_OWNER',
    });
};

export const assertMayManageMember = async (
  actor: { id: string; role?: string | null },
  target: { memberIdOrEmail?: string; userId?: string },
  organizationId: string | undefined,
) => {
  if (actor.role === 'admin' || !organizationId) return;

  const actorMember = await authDb().query.member.findFirst({
    where: and(
      eq(schema.member.organizationId, organizationId),
      eq(schema.member.userId, actor.id),
    ),
    columns: { id: true },
  });
  if (!actorMember) return;

  const { memberIdOrEmail, userId } = target;
  const [found] = await authDb()
    .select({ role: schema.user.role })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        userId
          ? eq(schema.member.userId, userId)
          : memberIdOrEmail?.includes('@')
            ? eq(schema.user.email, memberIdOrEmail.toLowerCase())
            : eq(schema.member.id, memberIdOrEmail ?? ''),
      ),
    )
    .limit(1);
  if (found?.role === 'admin')
    throw new APIError('FORBIDDEN', {
      message: 'Only a platform admin can remove or change a platform admin',
      code: 'PLATFORM_ADMIN_MEMBER_PROTECTED',
    });
};
