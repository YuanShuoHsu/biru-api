import { createAccessControl } from 'better-auth/plugins/access';
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from 'better-auth/plugins/organization/access';

const statement = {
  ...defaultStatements,
  menu: ['create', 'update', 'delete', 'read'],
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  ...ownerAc.statements,
  menu: ['create', 'update', 'delete', 'read'],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  menu: ['create', 'update', 'delete', 'read'],
});

export const member = ac.newRole({
  ...memberAc.statements,
  menu: ['read'],
});
