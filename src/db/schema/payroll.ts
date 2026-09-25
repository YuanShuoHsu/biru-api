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

export const PAYROLL_EARNING_LINE_CODES = [
  'basePay',
  'allowance',
  'overtimePay',
  'holidayPay',
  'calendarLeavePay',
  'injuryCompensation',
  'annualLeavePay',
  'severancePay',
  'noticePay',
  'roundingAdjustment',
] as const;

export const PAYROLL_DEDUCTION_LINE_CODES = [
  'leaveDeduction',
  'absenceDeduction',
  'laborInsurance',
  'healthInsurance',
  'healthSupplement',
  'voluntaryPension',
  'withholding',
  'retirementWithholding',
  'otherDeduction',
] as const;

export const PAYROLL_EMPLOYER_COST_CODES = [
  'laborInsurance',
  'employmentInsurance',
  'healthInsurance',
  'occupationalAccident',
  'wageGuarantee',
] as const;

export type PayrollEmployerCostCode =
  (typeof PAYROLL_EMPLOYER_COST_CODES)[number];

export type PayrollEarningLineCode =
  (typeof PAYROLL_EARNING_LINE_CODES)[number];
export type PayrollDeductionLineCode =
  (typeof PAYROLL_DEDUCTION_LINE_CODES)[number];
export type PayrollLineCode = PayrollEarningLineCode | PayrollDeductionLineCode;

export const PAYROLL_BLOCKERS = [
  'averageWageStatementsRequired',
  'belowMinimumWage',
  'birthDateRequired',
  'calendarLeavePayRequired',
  'childLaborHoursExceeded',
  'childLaborNightWork',
  'childLaborRestDay',
  'consecutiveWorkdaysExceeded',
  'dailyHoursExceeded',
  'emergencyDetailsRequired',
  'employmentInsuranceExemptionInvalid',
  'employmentInsuranceIneligible',
  'employmentInsuranceRequired',
  'healthInsuranceExemptionInvalid',
  'healthInsuranceRequired',
  'healthSupplementExemptionInvalid',
  'holidayCalendarMissing',
  'holidayDayKindRequired',
  'holidaySubstituteRequired',
  'incompleteAttendance',
  'inconsistentDayKind',
  'insuranceBasisOutdated',
  'insuranceBasisUnderDeclared',
  'insuranceTermsRequired',
  'laborInsuranceExemptionInvalid',
  'laborInsuranceRequired',
  'leavePolicyRequired',
  'legacySeniorityUnsupported',
  'maternalNightWork',
  'minimumWageUnconfirmed',
  'monthlyOvertimeExceeded',
  'negativeNetPay',
  'noShifts',
  'occupationalAccidentRateRequired',
  'openingHoursRequired',
  'overlappingLeaveAttendance',
  'parentalReturnPending',
  'partTimeLadderRequiresPartTime',
  'payrollPeriodOpen',
  'payrollRuleSetStale',
  'pendingRequests',
  'pensionIneligible',
  'pensionRequired',
  'prorationRequired',
  'shiftRestTooShort',
  'studentWeeklyHoursExceeded',
  'taiwanStaySinceRequired',
  'terminationReasonRequired',
  'unreviewedOvertime',
  'unsupportedDayKind',
  'weeklyRestRequired',
  'weeklyScheduleRequiresReview',
  'withholdingTableOutdated',
  'workPermitRequired',
] as const;

export type PayrollBlocker = (typeof PAYROLL_BLOCKERS)[number];

export const EMPLOYMENT_INSURANCE_EXEMPTIONS = [
  'publicInsurance',
  'oldAgeBenefit',
  'unregisteredEmployer',
  'otherEmployer',
] as const;

export type EmploymentInsuranceExemption =
  (typeof EMPLOYMENT_INSURANCE_EXEMPTIONS)[number];

export const LABOR_INSURANCE_EXEMPTIONS = ['oldAgeBenefit'] as const;

export type LaborInsuranceExemption =
  (typeof LABOR_INSURANCE_EXEMPTIONS)[number];

export const HEALTH_INSURANCE_EXEMPTIONS = [
  'shortTermOriginalCoverage',
  'otherEmployer',
] as const;

export type HealthInsuranceExemption =
  (typeof HEALTH_INSURANCE_EXEMPTIONS)[number];

export const HEALTH_SUPPLEMENT_EXEMPTIONS = [
  'secondCategory',
  'fifthCategory',
  'ineligible',
] as const;

export type HealthSupplementExemption =
  (typeof HEALTH_SUPPLEMENT_EXEMPTIONS)[number];

export const PAYROLL_TAX_METHODS = ['resident5', 'table'] as const;

export type PayrollTaxMethod = (typeof PAYROLL_TAX_METHODS)[number];

export interface TaiwanInsurance {
  laborCoverage: 'both' | 'labor' | 'employment' | 'none';
  laborInsuranceExemption?: LaborInsuranceExemption;
  employmentInsuranceExemption?: EmploymentInsuranceExemption;
  healthInsuranceExemption?: HealthInsuranceExemption;
  healthSupplementExemption?: HealthSupplementExemption;
  laborLadder?: 'general' | 'partTime';
  laborBasis: number;
  occupationalBasis: number;
  healthBasis: number;
  healthDependents: number;
  pensionBasis: number;
  voluntaryPercent: number;
  employerPercent: number;
  taxMethod: PayrollTaxMethod;
  withholdingDependents: number;
  voluntaryHealthInsurance?: boolean;
}

export interface WithholdingTable {
  year: number;
  exemption: number;
  standardDeduction: number;
  salaryDeduction: number;
  brackets: { upTo: number | null; rateBp: number }[];
  retirementExemptPerYear: number;
  retirementHalfTaxablePerYear: number;
}

export interface OccupationalIndustryRate {
  code: string;
  category: string;
  industry: string;
  rateMicros: number;
}

export interface TaiwanRuleSet {
  laborPercentBp: number;
  employmentPercentBp: number;
  healthPercentBp: number;
  laborEmployeeShareBp: number;
  laborEmployerShareBp: number;
  healthEmployeeShareBp: number;
  healthEmployerShareBp: number;
  healthAverageDependentsBp: number;
  commutingAccidentRateMicros: number;
  wageGuaranteeRateMicros: number;
  withholdingRateBp: number;
  withholdingExemptTaxCents: string;
  withholdingTable: WithholdingTable;
  healthSupplementRateBp: number;
  laborGrades: number[];
  partTimeLaborGrades: number[];
  occupationalGrades: number[];
  pensionGrades: number[];
  healthGrades: number[];
  minimumMonthlyWageCents: string;
  minimumHourlyWageCents: string;
  occupationalIndustryRates?: OccupationalIndustryRate[];
}

export interface PayrollTerms {
  insurance?: TaiwanInsurance;
  monthlyProration?: 'thirtyDays' | 'calendarDays';
  salaryType: 'monthly' | 'hourly';
  salaryCents: string;
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
  employerCosts?: { code: PayrollEmployerCostCode; amountCents: string }[];
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('payroll_statement_retry_uidx').on(
      t.organizationId,
      t.idempotencyKey,
    ),
    uniqueIndex('payroll_statement_month_uidx').on(t.employeeId, t.month),
  ],
);
