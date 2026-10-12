import { isDeepStrictEqual } from 'node:util';

import { sql, type SQL } from 'drizzle-orm';

import {
  ATTENDANCE_AUDIT_ACTIONS,
  type AttendanceAuditResource,
} from 'src/attendance/attendance-audit';
import { isAuthorized } from 'src/auth/permissions';

import type {
  AuditLogAction,
  AuditLogChanges,
} from './dto/audit-log-response.dto';

// 出勤與薪資紀錄另需該資料的讀取權限；null 表示有異動紀錄權限即可（假別任何成員都看得到）
const READ_PERMISSIONS: Record<
  AttendanceAuditResource,
  Record<string, string[]> | null
> = {
  attendanceRequest: { attendanceRequest: ['read'] },
  attendanceSetting: { attendanceSetting: ['read'] },
  earningType: { payrollTerm: ['read'] },
  employee: { employee: ['read'] },
  holidaySubstitute: { shift: ['read'] },
  leaveBalance: { leaveBalance: ['read'] },
  leaveCase: { leaveCase: ['read'] },
  leaveDeferral: { leaveBalance: ['read'] },
  leaveType: null,
  parentalChild: { parentalChild: ['read'] },
  parentalReturn: { parentalReturn: ['read'] },
  payrollTerm: { payrollTerm: ['read'] },
  payslip: { payslip: ['read'] },
  shift: { shift: ['read'] },
  shiftType: { shift: ['read'] },
  taxIdentity: { payrollTerm: ['read'] },
  withholdingCertificate: { payrollTerm: ['read'], payslip: ['read'] },
  withholdingUnit: { payrollTerm: ['read'] },
};

const EMPLOYEE_TABLES: Partial<Record<AttendanceAuditResource, string>> = {
  attendanceRequest: 'attendance_request',
  holidaySubstitute: 'attendance_holiday_substitute',
  leaveBalance: 'attendance_leave_balance',
  leaveCase: 'attendance_leave_case',
  leaveDeferral: 'attendance_annual_leave_deferral',
  parentalChild: 'attendance_parental_child',
  parentalReturn: 'attendance_parental_return',
  payrollTerm: 'payroll_terms',
  payslip: 'payroll_statement',
  shift: 'attendance_shift',
};

const EMPLOYEE_RESOURCES: AttendanceAuditResource[] = [
  'employee',
  'taxIdentity',
  'withholdingCertificate',
];

const HIDDEN_FIELDS = new Set([
  'idempotencyKey',
  'organizationId',
  'requestId',
  'shiftId',
  'updatedAt',
]);

export const LABELED_FIELDS = {
  childId: sql`SELECT id, reference AS label FROM attendance_parental_child`,
  employeeId: sql`SELECT e.id, u.name AS label FROM attendance_employee e JOIN "user" u ON u.id = e.user_id`,
  leaveTypeId: sql`SELECT id, name AS label FROM attendance_leave_type`,
  teamId: sql`SELECT id, name AS label FROM team`,
  userId: sql`SELECT id, name AS label FROM "user"`,
} satisfies Record<string, SQL>;

export type LabeledField = keyof typeof LABELED_FIELDS;

export const isLabeledField = (field: string): field is LabeledField =>
  field in LABELED_FIELDS;

export const readableAttendanceActions = (role?: string) =>
  Object.entries(ATTENDANCE_AUDIT_ACTIONS).filter(([, { resource }]) => {
    const permission = READ_PERMISSIONS[resource];
    return !role || !permission || isAuthorized(role, permission);
  });

export const attendanceEmployeeId = (resource: SQL, resourceId: SQL) => sql`
  CASE
    WHEN ${resource} IN (${sql.join(
      EMPLOYEE_RESOURCES.map((value) => sql`${value}`),
      sql`, `,
    )}) THEN ${resourceId}
    ${sql.join(
      Object.entries(EMPLOYEE_TABLES).map(
        ([value, table]) =>
          sql`WHEN ${resource} = ${value} THEN (SELECT employee_id FROM ${sql.identifier(table)} WHERE id = ${resourceId})`,
      ),
      sql` `,
    )}
  END`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isChange = (
  value: unknown,
): value is { before: unknown; after: unknown } =>
  isRecord(value) &&
  Object.keys(value).length === 2 &&
  'before' in value &&
  'after' in value;

export const toAuditLogChanges = (
  action: AuditLogAction,
  payload: Record<string, unknown>,
): AuditLogChanges => {
  if (
    isChange(payload) &&
    isRecord(payload.before) &&
    isRecord(payload.after)
  ) {
    const { before, after } = payload;
    return Object.fromEntries(
      [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter(
          (field) =>
            !HIDDEN_FIELDS.has(field) &&
            !isDeepStrictEqual(before[field], after[field]),
        )
        .map((field) => [
          field,
          { before: before[field] ?? null, after: after[field] ?? null },
        ]),
    );
  }

  return Object.fromEntries(
    Object.entries(payload)
      .filter(([field]) => !HIDDEN_FIELDS.has(field))
      .map(([field, value]) => [
        field,
        isChange(value)
          ? value
          : action === 'delete'
            ? { before: value }
            : { after: value },
      ]),
  );
};
