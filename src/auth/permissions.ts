import { createAccessControl } from 'better-auth/plugins/access';
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from 'better-auth/plugins/organization/access';

const statement = {
  ...defaultStatements,
  coupon: ['create', 'update', 'delete', 'read'],
  menu: ['create', 'update', 'delete', 'read'],
  order: ['read', 'update'],
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  ...ownerAc.statements,
  coupon: ['create', 'update', 'delete', 'read'],
  menu: ['create', 'update', 'delete', 'read'],
  order: ['read', 'update'],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  coupon: ['create', 'update', 'delete', 'read'],
  menu: ['create', 'update', 'delete', 'read'],
  order: ['read', 'update'],
});

export const member = ac.newRole({
  ...memberAc.statements,
  coupon: ['read'],
  menu: ['read'],
  order: ['read'],
});

export const isAuthorized = (
  role: string,
  action: Record<string, string[]>,
): boolean => {
  switch (role) {
    case 'owner':
      return owner.authorize(action).success;
    case 'admin':
      return admin.authorize(action).success;
    case 'member':
      return member.authorize(action).success;
    default:
      return false;
  }
};
