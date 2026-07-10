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
  order: ['read'],
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  ...ownerAc.statements,
  coupon: ['create', 'update', 'delete', 'read'],
  menu: ['create', 'update', 'delete', 'read'],
  order: ['read'],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  coupon: ['create', 'update', 'delete', 'read'],
  menu: ['create', 'update', 'delete', 'read'],
  order: ['read'],
});

export const member = ac.newRole({
  ...memberAc.statements,
  coupon: ['read'],
  menu: ['read'],
  order: ['read'],
});
