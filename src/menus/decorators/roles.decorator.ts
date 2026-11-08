import { SetMetadata } from '@nestjs/common';

import type { PermissionRequest } from '../../auth/permissions.js';

export const ROLES_KEY = 'roles';

export type OrganizationParam =
  | 'organizationId'
  | 'organizationSlug'
  | 'menuId'
  | 'sectionId'
  | 'menuItemId'
  | 'offerId'
  | 'addOnId'
  | 'groupId'
  | 'modifierId'
  | 'ingredientId'
  | 'supplierId'
  | 'recipeId';

export const Roles = (
  action: PermissionRequest,
  organizationParam: OrganizationParam,
) => SetMetadata(ROLES_KEY, { action, organizationParam });

export const OrganizationMember = (organizationParam: OrganizationParam) =>
  SetMetadata(ROLES_KEY, { organizationParam });
