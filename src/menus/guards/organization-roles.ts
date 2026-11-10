import { eq, inArray } from 'drizzle-orm';

import { member, type MemberRole } from '../../db/schema/organizations.js';
import { user } from '../../db/schema/users.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';

export const findOrganizationRoles = async (
  db: DrizzleDB,
  organizationId: string,
  userIds: string[],
  now = new Date(),
): Promise<Map<string, MemberRole>> => {
  if (!userIds.length) return new Map();

  const users = await db.query.user.findMany({
    where: inArray(user.id, userIds),
    columns: { id: true, role: true, banned: true, banExpires: true },
    with: {
      members: {
        where: eq(member.organizationId, organizationId),
        columns: { role: true },
      },
    },
  });

  const roles = new Map<string, MemberRole>();
  for (const { id, role, banned, banExpires, members } of users) {
    if (banned && (!banExpires || banExpires > now)) continue;
    const organizationRole = role === 'admin' ? 'owner' : members[0]?.role;
    if (organizationRole) roles.set(id, organizationRole);
  }

  return roles;
};
