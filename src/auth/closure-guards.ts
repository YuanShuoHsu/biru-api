import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';

import * as schema from '../db/schema/index.js';

import { authDb } from './auth-transaction.js';

export const ORGANIZATION_WRITE_PATHS = new Set([
  '/organization/accept-invitation',
  '/organization/add-member',
  '/organization/add-team-member',
  '/organization/create-team',
  '/organization/invite-member',
  '/organization/remove-team',
  '/organization/update',
  '/organization/update-member-role',
  '/organization/update-team',
]);

type Body = Record<string, unknown>;

const asString = (value: unknown) =>
  typeof value === 'string' ? value : undefined;

const findOrganizationId = async (
  body: Body,
  activeOrganizationId: string | null | undefined,
) => {
  const organizationId = asString(body.organizationId);
  if (organizationId) return organizationId;

  const invitationId = asString(body.invitationId);
  if (invitationId) {
    const row = await authDb().query.invitation.findFirst({
      where: eq(schema.invitation.id, invitationId),
      columns: { organizationId: true },
    });

    return row?.organizationId;
  }

  const teamId = asString(body.teamId);
  if (teamId) {
    const row = await authDb().query.team.findFirst({
      where: eq(schema.team.id, teamId),
      columns: { organizationId: true },
    });

    return row?.organizationId;
  }

  return activeOrganizationId ?? undefined;
};

export const assertOrganizationOpen = async (
  body: Body,
  activeOrganizationId: string | null | undefined,
) => {
  const organizationId = await findOrganizationId(body, activeOrganizationId);
  if (!organizationId) return;

  const row = await authDb().query.organization.findFirst({
    where: eq(schema.organization.id, organizationId),
    columns: { closedAt: true },
  });

  if (row?.closedAt)
    throw new APIError('FORBIDDEN', {
      message: 'The organization is closed and read-only',
      code: 'ORGANIZATION_CLOSED',
    });
};
