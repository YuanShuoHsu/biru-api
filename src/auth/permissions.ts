// https://www.better-auth.com/docs/plugins/organization#custom-permissions

import { createAccessControl } from 'better-auth/plugins/access';
import {
  adminAc,
  defaultStatements,
} from 'better-auth/plugins/organization/access';

const statement = {
  ...defaultStatements,
  // store: ['create', 'update', 'delete'],
  // menu: ['create', 'update', 'delete'],
  // order: ['read', 'update'],
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  // store: ['create', 'update', 'delete'],
  // menu: ['create', 'update', 'delete'],
  // order: ['read', 'update'],
  ...adminAc.statements,
  organization: ['update', 'delete'],
});

export const admin = ac.newRole({
  // store: ['create', 'update', 'delete'],
  // menu: ['create', 'update', 'delete'],
  // order: ['read', 'update'],
  ...adminAc.statements,
});

export const member = ac.newRole({
  // store: [],
  // menu: [],
  // order: ['read'],
});
