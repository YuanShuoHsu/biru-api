import { createAccessControl } from 'better-auth/plugins/access';
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from 'better-auth/plugins/organization/access';

const statement = {
  ...defaultStatements,
  auditLog: ['read'],
  coupon: ['create', 'read'],
  inventory: ['create', 'update', 'delete', 'read'],
  inventoryTransaction: ['create', 'read'],
  menu: ['create', 'update', 'delete', 'read'],
  order: ['read', 'update'],
  purchasing: ['create', 'update', 'delete', 'read'],
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  ...ownerAc.statements,
  auditLog: ['read'],
  coupon: ['create', 'read'],
  inventory: ['create', 'update', 'delete', 'read'],
  inventoryTransaction: ['create', 'read'],
  menu: ['create', 'update', 'delete', 'read'],
  order: ['read', 'update'],
  purchasing: ['create', 'update', 'delete', 'read'],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  auditLog: ['read'],
  coupon: ['create', 'read'],
  inventory: ['create', 'update', 'delete', 'read'],
  inventoryTransaction: ['create', 'read'],
  menu: ['create', 'update', 'delete', 'read'],
  order: ['read', 'update'],
  purchasing: ['create', 'update', 'delete', 'read'],
});

export const member = ac.newRole({
  ...memberAc.statements,
  coupon: ['read'],
  inventory: ['read'],
  inventoryTransaction: ['create', 'read'],
  menu: ['read'],
  order: ['read', 'update'],
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
