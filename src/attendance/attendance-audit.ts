import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { platformDateString } from '../common/constants/timezone.js';
import { attendanceAudit } from '../db/schema/attendance.js';
import { payrollStatement } from '../db/schema/payroll.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import type { AttendanceActor } from './attendance-actor.js';
import { conflictError } from './attendance-errors.js';

export type Transaction = Parameters<
  Parameters<DrizzleDB['transaction']>[0]
>[0];

export const lockOrganization = async (
  tx: Transaction,
  organizationId: string,
) => {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`,
  );
};

export const lockEmployee = async (
  tx: Transaction,
  organizationId: string,
  employeeId: string,
) => {
  await tx.execute(
    sql`select pg_advisory_xact_lock_shared(hashtextextended(${organizationId}, 0))`,
  );
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${employeeId}, 1))`,
  );
};

export const ATTENDANCE_AUDIT_ACTIONS = {
  'employee.create': { resource: 'employee', action: 'create' },
  'employee.update': { resource: 'employee', action: 'update' },
  'employee.restore': { resource: 'employee', action: 'restore' },
  'employee.delete': { resource: 'employee', action: 'delete' },
  'settings.update': { resource: 'attendanceSetting', action: 'update' },
  'leaveCase.create': { resource: 'leaveCase', action: 'create' },
  'leaveCase.update': { resource: 'leaveCase', action: 'update' },
  'leaveCase.restore': { resource: 'leaveCase', action: 'restore' },
  'leaveCase.delete': { resource: 'leaveCase', action: 'delete' },
  'leaveType.create': { resource: 'leaveType', action: 'create' },
  'leaveType.update': { resource: 'leaveType', action: 'update' },
  'leaveType.restore': { resource: 'leaveType', action: 'restore' },
  'leaveType.delete': { resource: 'leaveType', action: 'delete' },
  'leaveBalance.create': { resource: 'leaveBalance', action: 'create' },
  'leaveBalance.update': { resource: 'leaveBalance', action: 'update' },
  'leave.consume': { resource: 'leaveBalance', action: 'consume' },
  'leave.restore': { resource: 'leaveBalance', action: 'refund' },
  'leaveBalance.defer': { resource: 'leaveDeferral', action: 'create' },
  'leaveBalance.redefer': { resource: 'leaveDeferral', action: 'restore' },
  'leaveBalance.undefer': { resource: 'leaveDeferral', action: 'delete' },
  'holidaySubstitute.create': {
    resource: 'holidaySubstitute',
    action: 'create',
  },
  'holidaySubstitute.restore': {
    resource: 'holidaySubstitute',
    action: 'restore',
  },
  'holidaySubstitute.delete': {
    resource: 'holidaySubstitute',
    action: 'delete',
  },
  'request.create': { resource: 'attendanceRequest', action: 'create' },
  'request.review': { resource: 'attendanceRequest', action: 'review' },
  'request.reviewExtraWork': {
    resource: 'attendanceRequest',
    action: 'review',
  },
  'request.withdraw': { resource: 'attendanceRequest', action: 'withdraw' },
  'leave.cancelReview': { resource: 'attendanceRequest', action: 'review' },
  'leave.medicalReview': { resource: 'attendanceRequest', action: 'review' },
  'shift.create': { resource: 'shift', action: 'create' },
  'shift.update': { resource: 'shift', action: 'update' },
  'shift.cancel': { resource: 'shift', action: 'cancel' },
  'shift.restore': { resource: 'shift', action: 'restore' },
  'shiftType.create': { resource: 'shiftType', action: 'create' },
  'shiftType.update': { resource: 'shiftType', action: 'update' },
  'shiftType.restore': { resource: 'shiftType', action: 'restore' },
  'shiftType.delete': { resource: 'shiftType', action: 'delete' },
  'parentalChild.create': { resource: 'parentalChild', action: 'create' },
  'parentalChild.update': { resource: 'parentalChild', action: 'update' },
  'parentalChild.restore': { resource: 'parentalChild', action: 'restore' },
  'parentalChild.delete': { resource: 'parentalChild', action: 'delete' },
  'parentalChild.assign': { resource: 'leaveCase', action: 'update' },
  'parentalReturn.create': { resource: 'parentalReturn', action: 'create' },
  'parentalReturn.review': { resource: 'parentalReturn', action: 'review' },
  'parentalReturn.withdraw': { resource: 'parentalReturn', action: 'withdraw' },
  'payroll.terms': { resource: 'payrollTerm', action: 'update' },
  'payroll.draft': { resource: 'payslip', action: 'create' },
  'payroll.reviewed': { resource: 'payslip', action: 'review' },
  'payroll.published': { resource: 'payslip', action: 'publish' },
  'payroll.earningType.create': { resource: 'earningType', action: 'create' },
  'payroll.earningType.rename': { resource: 'earningType', action: 'update' },
  'payroll.earningType.restore': { resource: 'earningType', action: 'restore' },
  'payroll.earningType.delete': { resource: 'earningType', action: 'delete' },
  'payroll.withholdingUnit.save': {
    resource: 'withholdingUnit',
    action: 'update',
  },
  'payroll.taxIdentity.save': { resource: 'taxIdentity', action: 'update' },
  'payroll.certificate.request': {
    resource: 'withholdingCertificate',
    action: 'request',
  },
} as const;

export type AttendanceAuditAction = keyof typeof ATTENDANCE_AUDIT_ACTIONS;
export type AttendanceAuditResource =
  (typeof ATTENDANCE_AUDIT_ACTIONS)[AttendanceAuditAction]['resource'];

export const ATTENDANCE_AUDIT_RESOURCES = [
  ...new Set(
    Object.values(ATTENDANCE_AUDIT_ACTIONS).map(({ resource }) => resource),
  ),
];
export const ATTENDANCE_AUDIT_VERBS = [
  ...new Set(
    Object.values(ATTENDANCE_AUDIT_ACTIONS).map(({ action }) => action),
  ),
];

const UNAUDITED_FIELDS = new Set(['organizationId', 'updatedAt']);

const toJson = (value: unknown): unknown =>
  value === undefined ? null : JSON.parse(JSON.stringify(value));

export const auditChanges = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) => {
  const changed = Object.keys(after).filter(
    (field) =>
      !UNAUDITED_FIELDS.has(field) &&
      !isDeepStrictEqual(toJson(before[field]), toJson(after[field])),
  );
  return {
    before: Object.fromEntries(changed.map((field) => [field, before[field]])),
    after: Object.fromEntries(changed.map((field) => [field, after[field]])),
  };
};

export interface RestoredRecord {
  id: string;
  createdBy: string;
  finalize: (tx: Transaction) => Promise<void>;
  tx: Transaction;
}

export const writeAudits = async (
  tx: Transaction,
  actor: AttendanceActor,
  action: AttendanceAuditAction,
  entries: { resourceId: string; changes: Record<string, unknown> }[],
) => {
  if (!entries.length) return;
  await tx.insert(attendanceAudit).values(
    entries.map(({ resourceId, changes }) => ({
      id: randomUUID(),
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action,
      resourceId,
      changes,
    })),
  );
};

export const writeAudit = (
  tx: Transaction,
  actor: AttendanceActor,
  action: AttendanceAuditAction,
  resourceId: string,
  changes: Record<string, unknown>,
) => writeAudits(tx, actor, action, [{ resourceId, changes }]);

export const assertPayrollUnlocked = async (
  tx: Transaction,
  organizationId: string,
  employeeId: string,
  startsAt: Date,
  endsAt?: Date,
) => {
  const [published] = await tx
    .select({ id: payrollStatement.id })
    .from(payrollStatement)
    .where(
      and(
        eq(payrollStatement.organizationId, organizationId),
        eq(payrollStatement.employeeId, employeeId),
        eq(payrollStatement.status, 'published'),
        gte(payrollStatement.month, platformDateString(startsAt).slice(0, 7)),
        endsAt
          ? lte(
              payrollStatement.month,
              platformDateString(new Date(endsAt.getTime() - 1)).slice(0, 7),
            )
          : undefined,
      ),
    )
    .limit(1);
  if (published) throw conflictError('payrollLocked');
};
