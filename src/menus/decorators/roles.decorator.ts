import { SetMetadata } from '@nestjs/common';

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
  action: Record<string, string[]>,
  organizationParam: OrganizationParam,
) => SetMetadata(ROLES_KEY, { action, organizationParam });
