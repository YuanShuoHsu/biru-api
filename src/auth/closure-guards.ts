import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';

import * as schema from '../db/schema/index.js';

import { authDb } from './auth-transaction.js';

type Body = Record<string, unknown>;

const asString = (value: unknown) =>
  typeof value === 'string' ? value : undefined;

const bodyOrActive = (
  organizationId: unknown,
  activeOrganizationId: string | undefined,
) => asString(organizationId) || activeOrganizationId;

const invitationOrganizationId = async (invitationId: unknown) => {
  const id = asString(invitationId);
  if (!id) return undefined;

  const row = await authDb().query.invitation.findFirst({
    where: eq(schema.invitation.id, id),
    columns: { organizationId: true },
  });

  return row?.organizationId;
};

const ORGANIZATION_OF: Record<
  string,
  (
    body: Body,
    activeOrganizationId: string | undefined,
  ) => Promise<string | undefined> | string | undefined
> = {
  '/organization/accept-invitation': ({ invitationId }) =>
    invitationOrganizationId(invitationId),
  '/organization/add-member': ({ organizationId }, active) =>
    bodyOrActive(organizationId, active),
  '/organization/add-team-member': ({ organizationId }, active) =>
    bodyOrActive(organizationId, active),
  '/organization/create-team': ({ organizationId }, active) =>
    bodyOrActive(organizationId, active),
  '/organization/invite-member': ({ organizationId }, active) =>
    bodyOrActive(organizationId, active),
  '/organization/remove-team': ({ organizationId }, active) =>
    bodyOrActive(organizationId, active),
  '/organization/update': ({ organizationId }, active) =>
    bodyOrActive(organizationId, active),
  '/organization/update-member-role': ({ organizationId }, active) =>
    bodyOrActive(organizationId, active),
  '/organization/update-team': ({ data }, active) =>
    bodyOrActive(
      typeof data === 'object' && data !== null
        ? (data as Body).organizationId
        : undefined,
      active,
    ),
};

export const ORGANIZATION_WRITE_PATHS = new Set(Object.keys(ORGANIZATION_OF));

export const assertOrganizationOpen = async (
  path: string,
  body: Body,
  activeOrganizationId: string | undefined,
) => {
  const organizationId = await ORGANIZATION_OF[path]?.(
    body,
    activeOrganizationId,
  );
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
