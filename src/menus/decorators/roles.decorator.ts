import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export type OrganizationParam =
  | 'organizationId'
  | 'menuId'
  | 'sectionId'
  | 'menuItemId'
  | 'offerId'
  | 'addOnId'
  | 'groupId'
  | 'modifierId';

export const Roles = (
  action: Record<string, string[]>,
  organizationParam: OrganizationParam,
) => SetMetadata(ROLES_KEY, { action, organizationParam });
