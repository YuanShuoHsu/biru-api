import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { attendanceEmployee } from './attendance';
import { organization } from './organizations';

export const PAYROLL_LINE_CODES = [
  'basePay',
  'overtimePay',
  'holidayPay',
  'allowance',
  'calendarLeavePay',
  'annualLeavePay',
  'leaveDeduction',
  'laborInsurance',
  'healthInsurance',
  'voluntaryPension',
  'withholding',
  'otherDeduction',
] as const;

export type PayrollLineCode = (typeof PAYROLL_LINE_CODES)[number];

export const PAYROLL_BLOCKERS = [
  'attendanceShortfall',
  'belowMinimumWage',
  'calendarLeavePayRequired',
  'dailyHoursExceeded',
  'emergencyDetailsRequired',
  'hourlyAllowanceBasisRequired',
  'incompleteAttendance',
  'inconsistentDayKind',
  'insuranceBasisOutdated',
  'leavePolicyRequired',
  'minimumWageUnconfirmed',
  'monthlyOvertimeExceeded',
  'negativeNetPay',
  'noShifts',
  'overlappingLeaveAttendance',
  'parentalInsuranceRequired',
  'parentalReturnPending',
  'partTimeLadderRequiresPartTime',
  'payrollPeriodOpen',
  'payrollRuleSetStale',
  'pendingRequests',
  'prorationRequired',
  'unresolvedOvertime',
  'unsupportedDayKind',
  'weeklyScheduleRequiresReview',
] as const;

export type PayrollBlocker = (typeof PAYROLL_BLOCKERS)[number];

export interface TaiwanInsurance {
  laborCoverage: 'both' | 'labor' | 'employment' | 'none';
  laborLadder?: 'general' | 'partTime';
  laborBasis: number;
  healthBasis: number;
  healthDependents: number;
  pensionBasis: number;
  voluntaryPercent: number;
  employerPercent: number;
  taxMethod: 'resident5' | 'verified';
}

export interface TaiwanRuleSet {
  laborPercentBp: number;
  employmentPercentBp: number;
  healthPercentBp: number;
  laborEmployeeShareBp: number;
  healthEmployeeShareBp: number;
  withholdingRateBp: number;
  withholdingExemptTaxCents: string;
  laborGrades: number[];
  partTimeLaborGrades: number[];
  healthGrades: number[];
  minimumMonthlyWageCents: string;
  minimumHourlyWageCents: string;
}

export interface PayrollTerms {
  insurance?: TaiwanInsurance;
  monthlyProration?: 'thirtyDays' | 'calendarDays';
  allowanceHours?: number;
  salaryType: 'monthly' | 'hourly';
  salaryCents: string;
  laborInsuranceCents: string;
  healthInsuranceCents: string;
  voluntaryPensionCents: string;
  employerPensionCents: string;
  withholdingCents: string;
  allowanceCents: string;
  otherDeductionCents: string;
  sourceNote: string;
}

export interface PayrollLine {
  code: PayrollLineCode;
  amountCents: string;
  seconds?: number;
}

export interface PayrollSnapshot {
  terms: PayrollTerms;
  ruleVersion: string;
  lines: PayrollLine[];
  grossCents: string;
  deductionCents: string;
  netCents: string;
  employerPensionCents: string;
  workedSeconds: number;
  blockers: PayrollBlocker[];
  sourceFingerprint: string;
}

export interface PayrollRuleSource {
  label: string;
  url: string;
}

export const payrollRuleSet = pgTable(
  'payroll_rule_set',
  {
    id: text('id').primaryKey(),
    jurisdiction: text('jurisdiction').notNull().default('TW'),
    effectiveFrom: text('effective_from').notNull(),
    ruleVersion: text('rule_version').notNull(),
    rules: jsonb('rules').$type<TaiwanRuleSet>().notNull(),
    origin: text('origin').notNull(),
    sources: jsonb('sources').$type<PayrollRuleSource[]>().notNull(),
    ratesCarriedFrom: text('rates_carried_from'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    unconfirmed: jsonb('unconfirmed')
      .$type<(keyof TaiwanRuleSet)[]>()
      .notNull()
      .default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('payroll_rule_set_period_uidx').on(
      t.jurisdiction,
      t.effectiveFrom,
    ),
  ],
);

export const payrollTerms = pgTable(
  'payroll_terms',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => attendanceEmployee.id),
    effectiveFrom: timestamp('effective_from', {
      withTimezone: true,
    }).notNull(),
    version: integer('version').notNull(),
    terms: jsonb('terms').$type<PayrollTerms>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('payroll_terms_employee_effective_uidx').on(
      t.employeeId,
      t.effectiveFrom,
      t.version,
    ),
  ],
);

export const payrollStatement = pgTable(
  'payroll_statement',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => attendanceEmployee.id),
    employeeName: text('employee_name').notNull(),
    month: text('month').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    version: integer('version').notNull(),
    status: text('status')
      .$type<'draft' | 'reviewed' | 'published'>()
      .notNull()
      .default('draft'),
    snapshot: jsonb('snapshot').$type<PayrollSnapshot>().notNull(),
    reason: text('reason').notNull(),
    createdBy: text('created_by').notNull(),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    reopenedBy: text('reopened_by'),
    reopenedAt: timestamp('reopened_at', { withTimezone: true }),
    reopenReason: text('reopen_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('payroll_statement_retry_uidx').on(
      t.organizationId,
      t.idempotencyKey,
    ),
    uniqueIndex('payroll_statement_version_uidx').on(
      t.employeeId,
      t.month,
      t.version,
    ),
  ],
);
