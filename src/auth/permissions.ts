import { createAccessControl } from 'better-auth/plugins/access';
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from 'better-auth/plugins/organization/access';

const statement = {
  ...defaultStatements,
  attendanceRequest: ['read', 'update'],
  attendanceSetting: ['read', 'update'],
  auditLog: ['read'],
  coupon: ['create', 'read'],
  employee: ['create', 'read', 'update'],
  inventory: ['create', 'update', 'delete', 'read'],
  inventoryTransaction: ['create', 'read'],
  itemAvailability: ['update'],
  leaveBalance: ['create', 'update', 'read'],
  leaveCase: ['create', 'update', 'delete', 'read'],
  leaveType: ['create', 'update', 'delete'],
  menu: ['create', 'update', 'delete', 'read'],
  order: ['read', 'update'],
  parentalChild: ['create', 'read'],
  parentalReturn: ['read', 'update'],
  payrollTerm: ['create', 'update', 'read'],
  payslip: ['create', 'update', 'read'],
  purchasing: ['create', 'update', 'delete', 'read'],
  revenue: ['read'],
  shift: ['create', 'update', 'read'],
  shiftTemplate: ['create', 'update', 'delete', 'read'],
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  ...ownerAc.statements,
  attendanceRequest: ['read', 'update'],
  attendanceSetting: ['read', 'update'],
  auditLog: ['read'],
  coupon: ['create', 'read'],
  employee: ['create', 'read', 'update'],
  inventory: ['create', 'update', 'delete', 'read'],
  inventoryTransaction: ['create', 'read'],
  itemAvailability: ['update'],
  leaveBalance: ['create', 'update', 'read'],
  leaveCase: ['create', 'update', 'delete', 'read'],
  leaveType: ['create', 'update', 'delete'],
  menu: ['create', 'update', 'delete', 'read'],
  order: ['read', 'update'],
  parentalChild: ['create', 'read'],
  parentalReturn: ['read', 'update'],
  payrollTerm: ['create', 'update', 'read'],
  payslip: ['create', 'update', 'read'],
  purchasing: ['create', 'update', 'delete', 'read'],
  revenue: ['read'],
  shift: ['create', 'update', 'read'],
  shiftTemplate: ['create', 'update', 'delete', 'read'],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  attendanceRequest: ['read', 'update'],
  auditLog: ['read'],
  coupon: ['create', 'read'],
  employee: ['create', 'read', 'update'],
  inventory: ['create', 'update', 'delete', 'read'],
  inventoryTransaction: ['create', 'read'],
  itemAvailability: ['update'],
  leaveBalance: ['create', 'update', 'read'],
  leaveCase: ['create', 'update', 'delete', 'read'],
  menu: ['create', 'update', 'delete', 'read'],
  order: ['read', 'update'],
  parentalChild: ['create', 'read'],
  parentalReturn: ['read', 'update'],
  purchasing: ['create', 'update', 'delete', 'read'],
  revenue: ['read'],
  shift: ['create', 'update', 'read'],
  shiftTemplate: ['create', 'update', 'delete', 'read'],
});

export const member = ac.newRole({
  ...memberAc.statements,
  coupon: ['read'],
  inventory: ['read'],
  inventoryTransaction: ['create', 'read'],
  itemAvailability: ['update'],
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
