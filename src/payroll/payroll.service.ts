import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  like,
  lt,
  lte,
  ne,
  or,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';

import type { AttendanceActor } from 'src/attendance/attendance-actor';
import {
  assertPayrollUnlocked,
  lockOrganization,
  writeAudit,
  type Transaction,
} from 'src/attendance/attendance-audit';
import {
  badRequestError,
  conflictError,
  runBatch,
} from 'src/attendance/attendance-errors';
import {
  countedIntervals,
  countedRequestStatuses,
  ADULT_WORKING_AGE,
  ageOn,
  agreedWorkdates,
  childLaborViolation,
  exceedsConsecutiveWorkdays,
  exceedsStudentWeeklyLimit,
  hasShortRestBetweenShifts,
  lacksWeeklyRest,
  EXTENDED_MONTHLY_OVERTIME_SECONDS,
  intersectIntervals,
  punchedUnpaidBreaks,
  subtractIntervals,
  leadingIntervals,
  MAX_CONSECUTIVE_WORKDAYS,
  MAX_MONTHLY_OVERTIME_SECONDS,
  overlapIntervals,
  maternalNightWork,
  maternalProtectionPeriods,
  nursingAllowanceSeconds,
  overtimeExtensionPeriodOf,
  scheduledWorkIntervals,
  scheduledWorkSeconds,
  summarizeEvents,
  type TimeInterval,
  unreviewedOvertime,
  weekStartOfDate,
  withinPeriods,
  workPermitRequired,
} from 'src/attendance/attendance-rules';
import {
  averageWeeklyMinutes,
  employmentType,
  loadOneEmployeeHours,
  weeklyMinutesAt,
  weeklyMinutesOf,
  type EmployeeHours,
} from 'src/attendance/employee-hours';
import {
  loadAgreedHolidays,
  loadHolidaySubstitutes,
} from 'src/attendance/holiday-substitutes';
import { annualLeaveDeferrals } from 'src/attendance/leave-ledger';
import {
  effectivePaidPercent,
  isCalendarLeave,
} from 'src/attendance/leave-rules';
import {
  isMedicalLeave,
  loadMedicalLedger,
  medicalPaidSeconds,
} from 'src/attendance/medical-leave';
import {
  DAY_MS,
  platformDateString,
  STORE_UTC_OFFSET,
} from 'src/common/constants/timezone';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
} from 'src/common/utils/data-grid-filters';
import {
  attendanceEmployee,
  attendanceEvent,
  attendanceLeaveCase,
  attendanceLeaveType,
  attendanceParentalReturn,
  attendanceRequest,
  attendanceSettings,
  statutoryHoliday,
  attendanceShift,
  type AttendanceDayKind,
  type StatutoryLeaveKind,
} from 'src/db/schema/attendance';
import {
  payrollEarning,
  payrollEarningType,
  payrollStatement,
  payrollTerms,
  type PayrollBlocker,
  type PayrollSnapshot,
  type PayrollTerms,
} from 'src/db/schema/payroll';
import { user } from 'src/db/schema/users';
import { member, organization } from 'src/db/schema/organizations';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';
import { openingWeekdays } from 'src/common/utils/opening-hours';
import { overtimeBeforeAgreement } from 'src/attendance/overtime-limit';

import { annualLeaveSettlement } from './annual-leave';
import {
  averageDailyWage,
  NEW_PENSION_SYSTEM_START,
  owesNotice,
  owesSeverance,
  terminationPay,
} from './severance';
import { PayrollBatchDraftDto, PayrollDraftDto } from './dto/payroll-draft.dto';
import { PayrollBatchReviewDto } from './dto/payroll-review.dto';
import {
  PAYROLL_STATEMENT_ENUM_FILTER_FIELDS,
  PAYROLL_STATEMENT_MONTH_FILTER_FIELDS,
  PAYROLL_STATEMENT_STRING_FILTER_FIELDS,
  PayrollStatementPaginationQueryDto,
} from './dto/payroll-statement-pagination-query.dto';
import { PayrollTermsDto } from './dto/payroll-terms.dto';
import {
  calculatePayroll,
  payrollPeriod,
  recurringAllowanceCents,
  roundRatio,
} from './payroll-calculation';
import {
  calendarLeavePay,
  clipToPeriod,
  employmentPeriod,
  exceedsWeeklySchedule,
  intervalSeconds,
  contributionCoverageDays,
  periodWork,
} from './payroll-period';
import {
  averageMonthlyWage,
  insurableWages,
  precedingMonths,
} from './insurable-wages';
import { PayrollEarningsService } from './payroll-earnings.service';
import { PayrollRulesService } from './payroll-rules.service';
import { salaryIncomeCents } from './salary-income';
import {
  currentGrade,
  deriveInsurance,
  LABOR_INSURANCE_MANDATORY_HEADCOUNT,
  insuranceGrade,
  insuranceViolations,
  laborGradesFor,
  pensionApplicable,
} from './taiwan-rules';
import { assertIndependentReview } from 'src/attendance/review-separation';

// 勞工請假規則 §9：只有普通傷病假與非家庭照顧事假可按比例扣全勤；其他法定假別依法不得視為缺勤
const ATTENDANCE_BONUS_DEDUCTIBLE_KINDS: readonly StatutoryLeaveKind[] = [
  'sick',
  'hospitalSick',
  'personal',
];

const knownFullTime = (hours: EmployeeHours, at: Date) => {
  const weeklyMinutes = averageWeeklyMinutes(hours, at);

  return weeklyMinutes !== null && employmentType(weeklyMinutes) === 'fullTime';
};

const worksEveryBusinessDay = (
  employment: { hiredAt: Date; terminatedAt: Date | null },
  { start, end }: { start: Date; end: Date },
  businessDays: Set<number> | null,
  workedDates: Set<string>,
) => {
  const openDates: string[] = [];
  for (
    let time = Math.max(start.getTime(), employment.hiredAt.getTime());
    time <
    Math.min(end.getTime(), employment.terminatedAt?.getTime() ?? Infinity);
    time += DAY_MS
  ) {
    const date = platformDateString(new Date(time));
    if (businessDays?.has((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7))
      openDates.push(date);
  }
  return (
    openDates.length > 0 && openDates.every((date) => workedDates.has(date))
  );
};

interface PayrollSettings {
  overtimeAgreedFrom: string | null;
  overtimeExtensionPeriods: string[];
  occupationalIndustryCode: string | null;
  occupationalExperienceRateMicros: number | null;
  payday: number | null;
  paydayNextMonth: boolean;
  holidays: string[] | null;
}

const NO_PAYROLL_SETTINGS: PayrollSettings = {
  overtimeAgreedFrom: null,
  overtimeExtensionPeriods: [],
  occupationalIndustryCode: null,
  occupationalExperienceRateMicros: null,
  payday: null,
  paydayNextMonth: false,
  holidays: [],
};

const paidOnOf = (
  month: string,
  {
    payday,
    paydayNextMonth,
  }: Pick<PayrollSettings, 'payday' | 'paydayNextMonth'>,
) => {
  if (payday === null) return null;
  const [year, number] = month.split('-').map(Number);
  const target = new Date(
    Date.UTC(year, number - 1 + (paydayNextMonth ? 1 : 0)),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(payday, lastDay));
  return target.toISOString().slice(0, 10);
};

// 勞保條例 §7：曾達 5 人投保後人數減少仍應續保；§8 II：自願投保後不得中途退保
const laborInsuranceMandatory = async (
  tx: Transaction,
  organizationId: string,
  month: string,
) => {
  const [settings] = await tx
    .select({
      voluntaryFrom: attendanceSettings.voluntaryLaborInsuranceFrom,
    })
    .from(attendanceSettings)
    .where(eq(attendanceSettings.organizationId, organizationId));
  if (settings?.voluntaryFrom && settings.voluntaryFrom <= month) return true;
  const { end } = payrollPeriod(month);
  const employments = await tx
    .select({
      hiredAt: attendanceEmployee.hiredAt,
      terminatedAt: attendanceEmployee.terminatedAt,
    })
    .from(attendanceEmployee)
    .leftJoin(
      attendanceSettings,
      eq(attendanceSettings.organizationId, attendanceEmployee.organizationId),
    )
    .leftJoin(
      member,
      and(
        eq(member.organizationId, attendanceEmployee.organizationId),
        eq(member.userId, attendanceEmployee.userId),
      ),
    )
    .where(
      and(
        or(
          eq(attendanceEmployee.organizationId, organizationId),
          sql`${attendanceSettings.laborInsuranceUnitCode} = (SELECT s.labor_insurance_unit_code FROM attendance_settings s WHERE s.organization_id = ${organizationId})`,
        ),
        or(isNull(member.role), ne(member.role, 'owner')),
        lt(attendanceEmployee.hiredAt, end),
      ),
    );
  if (employments.length < LABOR_INSURANCE_MANDATORY_HEADCOUNT) return false;
  const first = platformDateString(
    new Date(Math.min(...employments.map(({ hiredAt }) => hiredAt.getTime()))),
  ).slice(0, 7);
  for (
    let cursor = month;
    cursor >= first;
    cursor = precedingMonths(cursor, 1)[0]
  ) {
    const period = payrollPeriod(cursor);
    if (
      employments.filter(
        ({ hiredAt, terminatedAt }) =>
          hiredAt < period.end &&
          (!terminatedAt || terminatedAt > period.start),
      ).length >= LABOR_INSURANCE_MANDATORY_HEADCOUNT
    )
      return true;
  }
  return false;
};

const WEEKS_PER_MONTH = 52 / 12;

const TAX_RESIDENCY_DAYS = 183;

const taiwanStayDays = (staySince: string, periodEnd: Date) => {
  const lastDay = platformDateString(new Date(periodEnd.getTime() - 1));
  const from = [staySince, `${lastDay.slice(0, 4)}-01-01`].sort()[1];

  return from > lastDay
    ? 0
    : (Date.parse(lastDay) - Date.parse(from)) / DAY_MS + 1;
};

const agreedMonthlyWage = (
  terms: Pick<
    PayrollTerms,
    | 'allowanceCents'
    | 'attendanceBonusCents'
    | 'mealAllowanceCents'
    | 'salaryCents'
    | 'salaryType'
  >,
  weeklyMinutes: number,
) =>
  (Number(terms.salaryCents) *
    (terms.salaryType === 'hourly'
      ? (weeklyMinutes / 60) * WEEKS_PER_MONTH
      : 1) +
    Number(recurringAllowanceCents(terms))) /
  100;

const adjustmentReferenceMonths = (month: string) => {
  const [year, number] = month.split('-').map(Number);
  const pad = (value: number) => String(value).padStart(2, '0');
  if (number >= 3 && number <= 8)
    return [`${year - 1}-11`, `${year - 1}-12`, `${year}-01`];
  const summerYear = number >= 9 ? year : year - 1;

  return [5, 6, 7].map((value) => `${summerYear}-${pad(value)}`);
};

@Injectable()
export class PayrollService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private readonly ruleSets: PayrollRulesService,
    private readonly earnings: PayrollEarningsService,
  ) {}
  async terms(actor: AttendanceActor) {
    return this.db
      .select()
      .from(payrollTerms)
      .where(eq(payrollTerms.organizationId, actor.organizationId))
      .orderBy(desc(payrollTerms.effectiveFrom), desc(payrollTerms.version));
  }

  async saveTerms(actor: AttendanceActor, dto: PayrollTermsDto) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [employee] = await tx
        .select()
        .from(attendanceEmployee)
        .where(
          and(
            eq(attendanceEmployee.id, dto.employeeId),
            eq(attendanceEmployee.organizationId, actor.organizationId),
          ),
        );
      if (!employee) throw new NotFoundException();
      const { employeeId, effectiveFrom, ...terms } = dto;
      const date = new Date(`${effectiveFrom}T00:00:00${STORE_UTC_OFFSET}`);
      const ruleSet = await this.ruleSets.resolve(
        tx,
        effectiveFrom.slice(0, 7),
      );
      if (!ruleSet) throw badRequestError('payrollRuleSetMissing');
      const hours = await loadOneEmployeeHours(tx, employee);
      const month = effectiveFrom.slice(0, 7);
      const period = payrollPeriod(month);
      const [[store], monthShifts] = await Promise.all([
        tx
          .select({ openingHours: organization.openingHours })
          .from(organization)
          .where(eq(organization.id, actor.organizationId)),
        tx
          .select()
          .from(attendanceShift)
          .where(
            and(
              eq(attendanceShift.employeeId, employee.id),
              ne(attendanceShift.status, 'cancelled'),
              gte(attendanceShift.startsAt, period.start),
              lt(attendanceShift.startsAt, period.end),
            ),
          ),
      ]);
      const context = {
        age: employee.birthDate
          ? ageOn(employee.birthDate, effectiveFrom)
          : null,
        laborInsuranceMandatory: await laborInsuranceMandatory(
          tx,
          actor.organizationId,
          month,
        ),
        legalStatus: employee.legalStatus,
        weeklyMinutes: weeklyMinutesAt(hours, date),
        worksEveryBusinessDay: worksEveryBusinessDay(
          employee,
          period,
          openingWeekdays(store?.openingHours ?? null),
          new Set(
            monthShifts
              .filter((shift) => scheduledWorkSeconds(shift) > 0)
              .map((shift) => platformDateString(shift.startsAt)),
          ),
        ),
      };
      const recentWages =
        terms.salaryType === 'hourly'
          ? await insurableWages(tx, employeeId, precedingMonths(month, 3))
          : [];
      const insurance = deriveInsurance(ruleSet.rules, terms.insurance, {
        ...context,
        fullTime: knownFullTime(hours, date),
        referenceWage:
          recentWages.length === 3
            ? averageMonthlyWage(recentWages)
            : agreedMonthlyWage(terms, context.weeklyMinutes),
      });
      const [violation] = insuranceViolations(insurance, context);
      if (violation) throw badRequestError(violation);
      const [successor] = await tx
        .select({ effectiveFrom: payrollTerms.effectiveFrom })
        .from(payrollTerms)
        .where(
          and(
            eq(payrollTerms.employeeId, employeeId),
            gt(payrollTerms.effectiveFrom, date),
          ),
        )
        .orderBy(asc(payrollTerms.effectiveFrom))
        .limit(1);
      await assertPayrollUnlocked(
        tx,
        actor.organizationId,
        employeeId,
        date,
        successor?.effectiveFrom,
      );
      const [previous] = await tx
        .select()
        .from(payrollTerms)
        .where(
          and(
            eq(payrollTerms.employeeId, employeeId),
            eq(payrollTerms.effectiveFrom, date),
          ),
        )
        .orderBy(desc(payrollTerms.version))
        .limit(1);
      const [row] = await tx
        .insert(payrollTerms)
        .values({
          id: randomUUID(),
          organizationId: actor.organizationId,
          employeeId,
          effectiveFrom: date,
          version: (previous?.version ?? 0) + 1,
          terms: {
            ...terms,
            insurance,
            sourceNote: terms.sourceNote?.trim() ?? '',
          },
        })
        .returning();
      await writeAudit(tx, actor, 'payroll.terms', row.id, {
        employeeId,
        effectiveFrom,
      });
      return row;
    });
  }

  async list(
    actor: AttendanceActor,
    mine: boolean,
    query: PayrollStatementPaginationQueryDto,
  ) {
    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterEnums,
      quickFilterValue,
      sortBy,
      sortDirection = 'desc',
    } = query;
    const conditions = [
      eq(payrollStatement.organizationId, actor.organizationId),
    ];
    if (mine) {
      const [employee] = await this.db
        .select()
        .from(attendanceEmployee)
        .where(
          and(
            eq(attendanceEmployee.organizationId, actor.organizationId),
            eq(attendanceEmployee.userId, actor.userId),
          ),
        );
      if (!employee) return { data: [], total: 0 };
      conditions.push(
        eq(payrollStatement.employeeId, employee.id),
        eq(payrollStatement.status, 'published'),
      );
    }
    const fieldMap: Record<string, Column | SQL> = {
      employeeName: payrollStatement.employeeName,
      month: payrollStatement.month,
      status: payrollStatement.status,
    };
    const where = and(
      ...conditions,
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            PAYROLL_STATEMENT_STRING_FILTER_FIELDS,
            [],
            PAYROLL_STATEMENT_ENUM_FILTER_FIELDS,
            [],
            [],
            [],
            [],
            PAYROLL_STATEMENT_MONTH_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: PAYROLL_STATEMENT_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(payrollStatement.employeeName, `%${value}%`),
          ilike(
            sql`replace(${payrollStatement.month}, '-', '/')`,
            `%${value}%`,
          ),
        ],
      }),
    );
    const sort = sortDirection === 'asc' ? asc : desc;
    const [data, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(payrollStatement)
        .where(where)
        .orderBy(
          ...(sortBy
            ? [sort(fieldMap[sortBy])]
            : [desc(payrollStatement.month)]),
          asc(payrollStatement.id),
        )
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(payrollStatement).where(where),
    ]);
    return { data, total };
  }

  private async payrollEmployee(
    tx: Transaction,
    actor: AttendanceActor,
    employeeId: string,
  ) {
    const [employee] = await tx
      .select({ ...getTableColumns(attendanceEmployee), name: user.name })
      .from(attendanceEmployee)
      .innerJoin(user, eq(user.id, attendanceEmployee.userId))
      .where(
        and(
          eq(attendanceEmployee.id, employeeId),
          eq(attendanceEmployee.organizationId, actor.organizationId),
        ),
      );
    if (!employee) throw new NotFoundException();
    return employee;
  }

  private async payrollSettings(
    tx: Transaction,
    organizationId: string,
    month: string,
  ): Promise<PayrollSettings> {
    const [settings] = await tx
      .select({
        overtimeAgreedFrom: attendanceSettings.overtimeAgreedFrom,
        overtimeExtensionPeriods: attendanceSettings.overtimeExtensionPeriods,
        occupationalIndustryCode: attendanceSettings.occupationalIndustryCode,
        occupationalExperienceRateMicros:
          attendanceSettings.occupationalExperienceRateMicros,
        payday: attendanceSettings.payday,
        paydayNextMonth: attendanceSettings.paydayNextMonth,
      })
      .from(attendanceSettings)
      .where(eq(attendanceSettings.organizationId, organizationId));
    const holidays = await tx
      .select({ date: statutoryHoliday.date })
      .from(statutoryHoliday)
      .where(like(statutoryHoliday.date, `${month.slice(0, 4)}-%`));
    return {
      ...(settings ?? NO_PAYROLL_SETTINGS),
      holidays: holidays.length
        ? holidays
            .map(({ date }) => date)
            .filter((date) => date.startsWith(month))
        : null,
    };
  }

  private async snapshot(
    tx: Transaction,
    actor: AttendanceActor,
    employeeId: string,
    month: string,
    knownEmployee?: typeof attendanceEmployee.$inferSelect,
    {
      holidays: statutoryHolidays,
      occupationalExperienceRateMicros,
      occupationalIndustryCode,
      overtimeAgreedFrom,
      overtimeExtensionPeriods,
      ...payday
    } = NO_PAYROLL_SETTINGS,
  ): Promise<PayrollSnapshot> {
    const employee =
      knownEmployee ?? (await this.payrollEmployee(tx, actor, employeeId));
    const holidays =
      statutoryHolidays &&
      [
        ...new Set([
          ...statutoryHolidays,
          ...employee.indigenousHolidays.filter((date) =>
            date.startsWith(month),
          ),
        ]),
      ].sort();
    const { start, end } = payrollPeriod(month);
    const hours = await loadOneEmployeeHours(tx, employee);
    const termsHistory = await tx
      .select()
      .from(payrollTerms)
      .where(
        and(
          eq(payrollTerms.organizationId, actor.organizationId),
          eq(payrollTerms.employeeId, employeeId),
          lte(payrollTerms.effectiveFrom, start),
        ),
      )
      .orderBy(desc(payrollTerms.effectiveFrom), desc(payrollTerms.version));
    const [profile] = termsHistory;
    if (!profile) throw badRequestError('payrollTermsRequired');
    const termsAt = (date: Date) =>
      (termsHistory.find((row) => row.effectiveFrom <= date) ?? profile).terms;
    const adjacentShifts = await tx
      .select()
      .from(attendanceShift)
      .where(
        and(
          eq(attendanceShift.employeeId, employeeId),
          ne(attendanceShift.status, 'cancelled'),
          gte(attendanceShift.startsAt, new Date(start.getTime() - 7 * DAY_MS)),
          lt(attendanceShift.startsAt, new Date(end.getTime() + 7 * DAY_MS)),
        ),
      )
      .orderBy(asc(attendanceShift.startsAt), asc(attendanceShift.id));
    const shifts = adjacentShifts.filter(
      (shift) =>
        shift.startsAt.getTime() < end.getTime() + DAY_MS &&
        shift.endsAt.getTime() > start.getTime() - DAY_MS,
    );
    const events = shifts.length
      ? await tx
          .select()
          .from(attendanceEvent)
          .where(
            and(
              eq(attendanceEvent.employeeId, employeeId),
              inArray(
                attendanceEvent.shiftId,
                shifts.map((shift) => shift.id),
              ),
            ),
          )
          .orderBy(asc(attendanceEvent.occurredAt), asc(attendanceEvent.id))
      : [];
    const requests = await tx
      .select()
      .from(attendanceRequest)
      .where(
        and(
          eq(attendanceRequest.employeeId, employeeId),
          lt(attendanceRequest.startsAt, new Date(end.getTime() + DAY_MS)),
          sql`${attendanceRequest.endsAt} > ${new Date(start.getTime() - DAY_MS)}`,
        ),
      )
      .orderBy(desc(attendanceRequest.reviewedAt), asc(attendanceRequest.id));
    const leaveTypes = await tx
      .select()
      .from(attendanceLeaveType)
      .where(eq(attendanceLeaveType.organizationId, actor.organizationId))
      .orderBy(asc(attendanceLeaveType.id));
    const medical = leaveTypes.some((policy) =>
      isMedicalLeave(policy.statutoryKind),
    )
      ? await loadMedicalLedger(tx, employee)
      : null;
    const blockers: PayrollBlocker[] = [];
    const ruleSet = await this.ruleSets.resolve(tx, month);
    if (!ruleSet) throw badRequestError('payrollRuleSetMissing');
    const occupationalAccidentRateMicros =
      occupationalExperienceRateMicros ??
      ruleSet.rules.occupationalIndustryRates?.find(
        ({ code }) => code === occupationalIndustryCode,
      )?.rateMicros ??
      null;
    const insurance = profile.terms.insurance;
    if (
      insurance &&
      (!currentGrade(
        insurance.laborBasis,
        laborGradesFor(ruleSet.rules, insurance),
      ) ||
        !currentGrade(insurance.healthBasis, ruleSet.rules.healthGrades) ||
        !ruleSet.rules.occupationalGrades.includes(insurance.occupationalBasis))
    )
      blockers.push('insuranceBasisOutdated');
    if (insurance?.laborLadder === 'partTime' && knownFullTime(hours, start))
      blockers.push('partTimeLadderRequiresPartTime');
    const laborMandatory =
      !!insurance &&
      (await laborInsuranceMandatory(tx, actor.organizationId, month));
    const declaredWages = insurance
      ? await insurableWages(tx, employeeId, adjustmentReferenceMonths(month))
      : [];
    if (insurance && declaredWages.length === 3) {
      const wage = averageMonthlyWage(declaredWages);
      if (
        (insurance.laborCoverage !== 'none' &&
          insurance.laborBasis <
            insuranceGrade(wage, laborGradesFor(ruleSet.rules, insurance))) ||
        insurance.occupationalBasis <
          insuranceGrade(wage, ruleSet.rules.occupationalGrades) ||
        (insurance.healthBasis > 0 &&
          insurance.healthBasis <
            insuranceGrade(wage, ruleSet.rules.healthGrades)) ||
        (insurance.pensionBasis > 0 &&
          insurance.pensionBasis <
            insuranceGrade(wage, ruleSet.rules.pensionGrades))
      )
        blockers.push('insuranceBasisUnderDeclared');
    }
    const businessDays =
      insurance?.healthBasis === 0
        ? openingWeekdays(
            (
              await tx
                .select({ openingHours: organization.openingHours })
                .from(organization)
                .where(eq(organization.id, actor.organizationId))
            )[0]?.openingHours ?? null,
          )
        : null;
    if (!insurance) blockers.push('insuranceTermsRequired');
    else if (occupationalAccidentRateMicros === null)
      blockers.push('occupationalAccidentRateRequired');
    if (businessDays?.size === 0) blockers.push('openingHoursRequired');
    if (ruleSet.stale) blockers.push('payrollRuleSetStale');
    if (
      profile.terms.salaryType === 'hourly' &&
      ruleSet.unconfirmed.includes('minimumHourlyWageCents')
    )
      blockers.push('minimumWageUnconfirmed');
    const employment = employmentPeriod(
      start,
      end,
      employee.hiredAt,
      employee.terminatedAt,
      profile.terms.monthlyProration,
    );
    if (
      end > new Date() &&
      (!employee.terminatedAt || employee.terminatedAt > new Date())
    )
      blockers.push('payrollPeriodOpen');
    if (
      employment.partial &&
      (profile.terms.salaryType === 'monthly' ||
        recurringAllowanceCents(profile.terms) > 0n) &&
      !profile.terms.monthlyProration
    )
      blockers.push('prorationRequired');
    const calendarLeaves = requests.filter(
      (request) =>
        request.kind === 'leave' &&
        request.status === 'approved' &&
        leaveTypes.some(
          (type) =>
            type.id === request.leaveTypeId &&
            isCalendarLeave(type.statutoryKind),
        ),
    );
    const parentalLeaves = calendarLeaves.filter((request) =>
      leaveTypes.some(
        (type) =>
          type.id === request.leaveTypeId && type.statutoryKind === 'parental',
      ),
    );
    const pendingParentalReturns = leaveTypes.some(
      (type) => type.statutoryKind === 'parental',
    )
      ? (
          await tx
            .select()
            .from(attendanceParentalReturn)
            .where(
              and(
                eq(
                  attendanceParentalReturn.organizationId,
                  actor.organizationId,
                ),
                eq(attendanceParentalReturn.employeeId, employeeId),
                eq(attendanceParentalReturn.status, 'pending'),
              ),
            )
            .orderBy(asc(attendanceParentalReturn.id))
        ).filter(
          (request) =>
            request.returnsAt < end && request.originalEndsAt > start,
        )
      : [];
    if (pendingParentalReturns.length) blockers.push('parentalReturnPending');
    const calendarCases = calendarLeaves.length
      ? await tx
          .select()
          .from(attendanceLeaveCase)
          .where(
            and(
              eq(attendanceLeaveCase.organizationId, actor.organizationId),
              eq(attendanceLeaveCase.employeeId, employeeId),
            ),
          )
          .orderBy(asc(attendanceLeaveCase.id))
      : [];
    const coveredStart = Math.max(start.getTime(), employee.hiredAt.getTime());
    const coveredEnd = Math.min(
      end.getTime(),
      employee.terminatedAt?.getTime() ?? Infinity,
    );
    const {
      seconds: calendarSeconds,
      payCents: calendarPay,
      missingPay,
    } = calendarLeavePay(
      calendarLeaves,
      calendarCases,
      coveredStart,
      coveredEnd,
    );
    if (missingPay) blockers.push('calendarLeavePayRequired');
    const injuryCompensation = calendarLeavePay(
      calendarLeaves.filter((request) =>
        leaveTypes.some(
          (type) =>
            type.id === request.leaveTypeId &&
            type.statutoryKind === 'occupationalInjury',
        ),
      ),
      calendarCases,
      coveredStart,
      coveredEnd,
    ).payCents;
    const medicalCalendarSeconds = (medical?.segments ?? [])
      .filter((segment) => segment.calendar)
      .reduce(
        (sum, segment) =>
          sum + intervalSeconds(segment, coveredStart, coveredEnd),
        0,
      );
    if (
      !shifts.length &&
      (calendarSeconds + medicalCalendarSeconds) * 1000 <
        coveredEnd - coveredStart
    )
      blockers.push('noShifts');
    const fullMonthlyPay =
      (profile.terms.salaryType === 'monthly'
        ? BigInt(profile.terms.salaryCents)
        : 0n) + recurringAllowanceCents(profile.terms);
    const employedMonthlyPay = roundRatio(
      fullMonthlyPay * BigInt(employment.numerator),
      BigInt(employment.denominator),
    );
    const calendarBasisDays =
      profile.terms.monthlyProration === 'calendarDays'
        ? (end.getTime() - start.getTime()) / DAY_MS
        : 30;
    const calendarAmount = roundRatio(
      fullMonthlyPay * BigInt(Math.round(calendarSeconds)),
      BigInt(calendarBasisDays) * 86400n,
    );
    const wholeEmploymentOnLeave =
      calendarSeconds > 0 &&
      calendarSeconds * 1000 >= coveredEnd - coveredStart;
    if (
      fullMonthlyPay > 0n &&
      calendarSeconds > 0 &&
      !wholeEmploymentOnLeave &&
      !profile.terms.monthlyProration
    )
      blockers.push('prorationRequired');
    const calendarDeduction =
      wholeEmploymentOnLeave || calendarAmount > employedMonthlyPay
        ? employedMonthlyPay
        : calendarAmount;
    const days = new Map<
      string,
      {
        seconds: number;
        dayKind: AttendanceDayKind;
        scheduledSeconds: number;
        scheduledOffsetSeconds: number;
        paidLeaveSeconds: number;
        parentalScheduledSeconds: number;
      }
    >();
    const intervalsByDay = new Map<string, TimeInterval[]>();
    let leaveDeductionSeconds = 0;
    let attendanceDeductibleLeaveSeconds = 0;
    const absenceByDay = new Map<string, number>();
    const overtimeByDay = new Map<string, number>();
    const relevantDays = new Set(
      shifts
        .filter((shift) => shift.startsAt < end && shift.endsAt > start)
        .map((shift) => platformDateString(shift.startsAt)),
    );
    const relevantShiftIds = new Set(
      shifts
        .filter((shift) => relevantDays.has(platformDateString(shift.startsAt)))
        .map((shift) => shift.id),
    );
    if (
      requests.some(
        (request) =>
          ['pending', 'cancellationPending'].includes(request.status) &&
          ((request.startsAt < end && request.endsAt > start) ||
            (request.shiftId !== null &&
              relevantShiftIds.has(request.shiftId))),
      )
    )
      blockers.push('pendingRequests');
    for (const shift of shifts) {
      if (!relevantDays.has(platformDateString(shift.startsAt))) continue;
      const correction = requests.find(
        (request) =>
          request.shiftId === shift.id &&
          request.kind === 'correction' &&
          request.status === 'approved',
      );
      const effective =
        correction?.correctedEvents ??
        events
          .filter((event) => event.shiftId === shift.id)
          .map(({ action, occurredAt, paidBreak }) => ({
            action,
            occurredAt: occurredAt.toISOString(),
            paidBreak,
          }));
      const summary = summarizeEvents(effective, shift);
      if (
        shift.dayKind === 'regularLeave' &&
        summary.workedSeconds > 0 &&
        !requests.some(
          (request) =>
            request.shiftId === shift.id &&
            request.kind === 'overtime' &&
            request.status === 'approved' &&
            request.emergency,
        )
      )
        blockers.push('emergencyDetailsRequired');
      const workIntervals = scheduledWorkIntervals(shift);
      const workSeconds = scheduledWorkSeconds(shift);
      const leaves = requests.filter(
        (request) =>
          request.kind === 'leave' &&
          request.status === 'approved' &&
          request.startsAt < shift.endsAt &&
          request.endsAt > shift.startsAt,
      );
      let leaveSeconds = 0,
        paidLeaveSeconds = 0;
      for (const leave of leaves) {
        const policy = leaveTypes.find((type) => type.id === leave.leaveTypeId);
        if (!policy) blockers.push('leavePolicyRequired');
        for (const overlap of overlapIntervals(
          workIntervals,
          leave.startsAt.getTime(),
          leave.endsAt.getTime(),
        )) {
          const fullSeconds = intervalSeconds(overlap);
          const seconds = intervalSeconds(
            overlap,
            start.getTime(),
            end.getTime(),
          );
          leaveSeconds += fullSeconds;
          if (
            policy &&
            ATTENDANCE_BONUS_DEDUCTIBLE_KINDS.includes(policy.statutoryKind)
          )
            attendanceDeductibleLeaveSeconds += seconds;
          if (!policy || !isCalendarLeave(policy.statutoryKind)) {
            const paidPercent =
              leave.paidPercent ??
              (policy
                ? effectivePaidPercent(policy.statutoryKind, policy.paidPercent)
                : 0);
            const paid =
              policy && isMedicalLeave(policy.statutoryKind) && medical
                ? medicalPaidSeconds(
                    medical.segments,
                    leave.id,
                    Math.max(overlap.start, start.getTime()),
                    Math.min(overlap.end, end.getTime()),
                  )
                : (seconds * paidPercent) / 100;
            const calendarScheduledDeduction =
              profile.terms.salaryType === 'monthly' && medical
                ? medical.segments
                    .filter(
                      (segment) =>
                        segment.calendar && segment.requestId === leave.id,
                    )
                    .reduce(
                      (sum, segment) =>
                        sum +
                        intervalSeconds(
                          {
                            start: Math.max(segment.start, overlap.start),
                            end: Math.min(segment.end, overlap.end),
                          },
                          start.getTime(),
                          end.getTime(),
                        ) *
                          (1 - segment.paidFraction),
                      0,
                    )
                : 0;
            leaveDeductionSeconds += Math.round(
              seconds - paid - calendarScheduledDeduction,
            );
            paidLeaveSeconds += Math.round(paid);
          }
        }
      }
      if (
        summary.state !== 'completed' &&
        (summary.state !== 'scheduled' || shift.dayKind === 'workday') &&
        leaveSeconds < workSeconds
      )
        blockers.push('incompleteAttendance');
      const counted = countedIntervals(effective, shift);
      if (maternalNightWork(counted, maternalProtectionPeriods(employee)))
        blockers.push('maternalNightWork');
      if (
        leaves.some((leave) =>
          counted.some(
            (interval) =>
              interval.start < leave.endsAt.getTime() &&
              interval.end > leave.startsAt.getTime(),
          ),
        )
      )
        blockers.push('overlappingLeaveAttendance');
      const key = platformDateString(shift.startsAt);
      const previous = days.get(key);
      const approvedOvertime = requests
        .filter(
          (request) =>
            request.shiftId === shift.id &&
            request.kind === 'overtime' &&
            request.status === 'approved',
        )
        .map((request) => ({
          start: request.startsAt.getTime(),
          end: request.endsAt.getTime(),
        }));
      const payable = intersectIntervals(counted, [
        ...workIntervals,
        ...approvedOvertime,
      ]);
      if (
        summary.state === 'completed' &&
        unreviewedOvertime(counted, shift, [
          ...approvedOvertime,
          ...requests
            .filter(
              (request) =>
                request.shiftId === shift.id &&
                request.kind === 'overtime' &&
                request.status === 'rejected',
            )
            .map((request) => ({
              start: request.startsAt.getTime(),
              end: request.endsAt.getTime(),
            })),
        ]).length
      )
        blockers.push('unreviewedOvertime');
      intervalsByDay.set(key, [...(intervalsByDay.get(key) ?? []), ...payable]);
      overtimeByDay.set(
        key,
        (overtimeByDay.get(key) ?? 0) +
          intersectIntervals(counted, approvedOvertime).reduce(
            (sum, interval) => sum + intervalSeconds(interval),
            0,
          ),
      );
      if (shift.dayKind === 'workday' && summary.state === 'completed')
        absenceByDay.set(
          key,
          (absenceByDay.get(key) ?? 0) +
            subtractIntervals(workIntervals, [
              ...payable,
              ...punchedUnpaidBreaks(effective, shift),
              ...leaves.map((leave) => ({
                start: leave.startsAt.getTime(),
                end: leave.endsAt.getTime(),
              })),
            ]).reduce(
              (sum, interval) =>
                sum + intervalSeconds(interval, start.getTime(), end.getTime()),
              0,
            ),
        );
      if (previous && previous.dayKind !== shift.dayKind)
        blockers.push('inconsistentDayKind');
      const scheduledBefore =
        (previous?.scheduledSeconds ?? 0) +
        (previous?.scheduledOffsetSeconds ?? 0);
      const parentalScheduledSeconds = parentalLeaves.reduce(
        (sum, leave) =>
          sum +
          overlapIntervals(
            leadingIntervals(
              workIntervals,
              (8 * 3600 - scheduledBefore) * 1000,
            ),
            leave.startsAt.getTime(),
            leave.endsAt.getTime(),
          ).reduce(
            (total, interval) =>
              total + intervalSeconds(interval, start.getTime(), end.getTime()),
            0,
          ),
        0,
      );
      days.set(key, {
        seconds: (previous?.seconds ?? 0) + summary.workedSeconds,
        dayKind: shift.dayKind,
        scheduledSeconds:
          (previous?.scheduledSeconds ?? 0) +
          scheduledWorkSeconds(shift, start.getTime(), end.getTime()),
        scheduledOffsetSeconds:
          (previous?.scheduledOffsetSeconds ?? 0) +
          scheduledWorkSeconds(shift, -Infinity, start.getTime()),
        paidLeaveSeconds: (previous?.paidLeaveSeconds ?? 0) + paidLeaveSeconds,
        parentalScheduledSeconds:
          (previous?.parentalScheduledSeconds ?? 0) + parentalScheduledSeconds,
      });
    }
    for (const [key, intervals] of intervalsByDay)
      Object.assign(days.get(key)!, periodWork(intervals, start, end));
    let absenceSeconds = 0;
    for (const [key, absence] of absenceByDay) {
      const nursing = Math.min(
        absence,
        nursingAllowanceSeconds(
          employee.nursingPeriods,
          key,
          overtimeByDay.get(key) ?? 0,
        ),
      );
      absenceSeconds += absence - nursing;
      days.get(key)!.paidLeaveSeconds += nursing;
    }
    if (exceedsWeeklySchedule(adjacentShifts, start, end))
      blockers.push('weeklyScheduleRequiresReview');
    const monthWeeks = [
      weekStartOfDate(platformDateString(start)),
      weekStartOfDate(platformDateString(new Date(end.getTime() - 1))),
    ];
    const monthWeekShifts = adjacentShifts.filter((shift) => {
      const week = weekStartOfDate(platformDateString(shift.startsAt));
      return week >= monthWeeks[0] && week <= monthWeeks[1];
    });
    if (employee.legalStatus !== 'national' && !employee.taiwanStaySince)
      blockers.push('taiwanStaySinceRequired');
    if (!employee.birthDate) blockers.push('birthDateRequired');
    else if (
      ageOn(employee.birthDate, platformDateString(start)) < ADULT_WORKING_AGE
    ) {
      const violation = childLaborViolation(monthWeekShifts);
      if (violation) blockers.push(violation);
    }
    if (lacksWeeklyRest(monthWeekShifts)) blockers.push('weeklyRestRequired');
    const agreedHolidays = await loadAgreedHolidays(
      tx,
      [employee],
      platformDateString(
        new Date(start.getTime() - MAX_CONSECUTIVE_WORKDAYS * DAY_MS),
      ),
      platformDateString(
        new Date(end.getTime() + MAX_CONSECUTIVE_WORKDAYS * DAY_MS),
      ),
    );
    if (
      exceedsConsecutiveWorkdays(
        agreedWorkdates(adjacentShifts, agreedHolidays.get(employee.id) ?? []),
        (date) =>
          date >= platformDateString(start) && date < platformDateString(end),
      )
    )
      blockers.push('consecutiveWorkdaysExceeded');
    if (
      hasShortRestBetweenShifts(
        adjacentShifts,
        (shift) => shift.startsAt >= start && shift.startsAt < end,
      )
    )
      blockers.push('shiftRestTooShort');
    // 補假期日由勞雇協商、法無期限（細則 §23-1 II），只有離職後才補不了；逐月擋會逼店家先排下個月的班
    const substitutes =
      employee.terminatedAt &&
      employee.terminatedAt >= start &&
      employee.terminatedAt < end
        ? await loadHolidaySubstitutes(
            tx,
            [employee],
            platformDateString(employee.hiredAt),
            platformDateString(new Date(employee.terminatedAt.getTime() - 1)),
          )
        : null;
    if (
      substitutes?.owed
        .get(employee.id)
        ?.some(
          (date) => !substitutes.rows.some((row) => row.holidayDate === date),
        )
    )
      blockers.push('holidaySubstituteRequired');
    if (holidays === null) blockers.push('holidayCalendarMissing');
    else if (
      shifts.some(
        (shift) =>
          shift.dayKind === 'workday' &&
          shift.startsAt >= start &&
          shift.startsAt < end &&
          holidays.includes(platformDateString(shift.startsAt)),
      )
    )
      blockers.push('holidayDayKindRequired');
    if (
      workPermitRequired(employee.legalStatus) &&
      [...days.keys()].some(
        (date) =>
          date >= platformDateString(start) &&
          date < platformDateString(end) &&
          !withinPeriods(employee.workPermits, date),
      )
    )
      blockers.push('workPermitRequired');
    if (insurance)
      blockers.push(
        ...insuranceViolations(insurance, {
          age: employee.birthDate
            ? ageOn(employee.birthDate, platformDateString(start))
            : null,
          laborInsuranceMandatory: laborMandatory,
          legalStatus: employee.legalStatus,
          weeklyMinutes: weeklyMinutesAt(hours, end),
          worksEveryBusinessDay: worksEveryBusinessDay(
            employee,
            { start, end },
            businessDays,
            new Set(
              [...days]
                .filter(
                  ([, day]) => day.seconds > 0 || day.scheduledSeconds > 0,
                )
                .map(([date]) => date),
            ),
          ),
        }),
      );
    if (employee.legalStatus === 'foreignStudent') {
      const firstWeek = weekStartOfDate(platformDateString(start));
      const lastWeek = weekStartOfDate(
        platformDateString(new Date(end.getTime() - 1)),
      );
      const studentDays = [
        ...[...days].map(([date, { seconds }]) => ({ date, seconds })),
        ...adjacentShifts
          .map((shift) => ({
            date: platformDateString(shift.startsAt),
            seconds: scheduledWorkSeconds(shift),
          }))
          .filter(({ date }) => !days.has(date)),
      ].filter(({ date }) => {
        const week = weekStartOfDate(date);
        return week >= firstWeek && week <= lastWeek;
      });
      if (exceedsStudentWeeklyLimit(studentDays, employee.studentVacations))
        blockers.push('studentWeeklyHoursExceeded');
    }
    const annualPolicies = leaveTypes.filter(
      (policy) => policy.statutoryKind === 'annual',
    );
    const annualRequests = annualPolicies.length
      ? await tx
          .select()
          .from(attendanceRequest)
          .where(
            and(
              eq(attendanceRequest.employeeId, employeeId),
              inArray(
                attendanceRequest.leaveTypeId,
                annualPolicies.map((policy) => policy.id),
              ),
              inArray(attendanceRequest.status, countedRequestStatuses),
            ),
          )
          .orderBy(asc(attendanceRequest.id))
      : [];
    const annualDeferrals = annualPolicies.length
      ? await annualLeaveDeferrals(tx, [employeeId])
      : [];
    const annual = annualPolicies.length
      ? annualLeaveSettlement({
          hiredAt: employee.hiredAt,
          terminatedAt: employee.terminatedAt,
          weeklyMinutesAt: weeklyMinutesOf(hours),
          start,
          end,
          leaves: annualRequests,
          deferredPeriodStarts: annualDeferrals.map(
            (deferral) => deferral.periodStart,
          ),
        })
      : [];
    if (medical && profile.terms.salaryType === 'monthly') {
      for (const segment of medical.segments.filter((item) => item.calendar)) {
        const seconds = intervalSeconds(segment, coveredStart, coveredEnd);
        leaveDeductionSeconds += Math.round(
          (seconds / 3) * (1 - segment.paidFraction),
        );
      }
      if (fullMonthlyPay > 0n)
        leaveDeductionSeconds = Math.min(
          leaveDeductionSeconds,
          Math.max(
            0,
            Number(
              roundRatio(
                (employedMonthlyPay - calendarDeduction) * 864000n,
                fullMonthlyPay,
              ),
            ),
          ),
        );
    }
    const contributionDays = contributionCoverageDays(
      start,
      end,
      employee.hiredAt,
      employee.terminatedAt,
      parentalLeaves,
    );
    const employmentHealthCharged =
      employment.healthCharged &&
      !parentalLeaves.some(
        (leave) => leave.startsAt < end && leave.endsAt >= end,
      );
    const paidOn = paidOnOf(month, payday);
    if (!paidOn) blockers.push('paydayRequired');
    if (
      overtimeBeforeAgreement(
        [...days].map(([date, day]) => ({
          date,
          dayKind: day.dayKind,
          seconds: day.seconds,
        })),
        overtimeAgreedFrom,
      )
    )
      blockers.push('overtimeAgreementRequired');
    // 扣繳、補充保費與居住者身分都以給付時點認定，不看薪資月份
    const taxDate = paidOn ?? platformDateString(new Date(end.getTime() - 1));
    const taxYear = Number(taxDate.slice(0, 4));
    const taxRuleSet =
      taxDate.slice(0, 7) === month
        ? ruleSet
        : ((await this.ruleSets.resolve(tx, taxDate.slice(0, 7))) ?? ruleSet);
    const rules = {
      ...ruleSet.rules,
      withholdingRateBp: taxRuleSet.rules.withholdingRateBp,
      withholdingExemptTaxCents: taxRuleSet.rules.withholdingExemptTaxCents,
      withholdingTable: taxRuleSet.rules.withholdingTable,
      healthSupplementRateBp: taxRuleSet.rules.healthSupplementRateBp,
    };
    const nonResident =
      employee.legalStatus !== 'national' &&
      (!employee.taiwanStaySince ||
        taiwanStayDays(
          employee.taiwanStaySince,
          new Date(
            Date.parse(`${taxDate}T00:00:00${STORE_UTC_OFFSET}`) + DAY_MS,
          ),
        ) < TAX_RESIDENCY_DAYS);
    const earnings = await tx
      .select({
        name: payrollEarningType.name,
        category: payrollEarningType.category,
        amountCents: payrollEarning.amountCents,
      })
      .from(payrollEarning)
      .innerJoin(
        payrollEarningType,
        eq(payrollEarningType.id, payrollEarning.earningTypeId),
      )
      .where(
        and(
          eq(payrollEarning.employeeId, employeeId),
          eq(payrollEarning.month, month),
        ),
      )
      .orderBy(asc(payrollEarningType.name), asc(payrollEarning.id));
    const hasBonus = earnings.some(({ category }) => category === 'bonus');
    const bonusYearToDateCents = hasBonus
      ? (
          await tx
            .select({ snapshot: payrollStatement.snapshot })
            .from(payrollStatement)
            .where(
              and(
                eq(payrollStatement.employeeId, employeeId),
                eq(payrollStatement.status, 'published'),
                like(payrollStatement.paidOn, `${taxYear}-%`),
                ne(payrollStatement.month, month),
              ),
            )
        )
          .flatMap(({ snapshot }) => snapshot.lines)
          .filter(({ code }) => code === 'bonus')
          .reduce((sum, { amountCents }) => sum + BigInt(amountCents), 0n)
          .toString()
      : '0';
    if (
      (insurance?.taxMethod === 'table' || hasBonus) &&
      rules.withholdingTable.year !== taxYear
    )
      blockers.push('withholdingTableOutdated');
    const payroll = (severance?: ReturnType<typeof terminationPay>) => {
      const { annualLeavePayoutCents, ...statement } = calculatePayroll(
        rules,
        profile.terms,
        [...days.values()].filter(
          (day) =>
            day.seconds > 0 ||
            day.scheduledSeconds > 0 ||
            day.paidLeaveSeconds > 0,
        ),
        leaveDeductionSeconds,
        {
          absenceSeconds,
          attendanceDeductibleSeconds:
            attendanceDeductibleLeaveSeconds + absenceSeconds,
          earnings,
          bonusYearToDateCents,
          ...employment,
          // 育嬰留停期間雇主負擔免繳、勞工負擔遞延三年（性平法 §16），都不從薪資扣
          coverageDays: contributionDays,
          healthCharged: employmentHealthCharged,
          contributionDays,
          nonResident,
          severance,
          occupationalAccidentRateMicros,
          annualLeavePayouts: annual.map((settlement) => ({
            minutes: settlement.unusedMinutes,
            terms: termsAt(new Date(settlement.wageDate)),
          })),
          calendarLeaveDeductionCents: calendarDeduction.toString(),
          calendarLeavePayCents: (calendarPay - injuryCompensation).toString(),
          injuryCompensationCents: injuryCompensation.toString(),
          monthlyOvertimeLimitSeconds: overtimeExtensionPeriodOf(
            overtimeExtensionPeriods,
            Number(month.slice(0, 4)),
            Number(month.slice(5, 7)) - 1,
          )
            ? EXTENDED_MONTHLY_OVERTIME_SECONDS
            : MAX_MONTHLY_OVERTIME_SECONDS,
        },
      );
      return { annualLeavePayoutCents, statement };
    };
    const { annualLeavePayoutCents, statement: wages } = payroll();
    const terminatedAt =
      employee.terminatedAt &&
      employee.terminatedAt >= start &&
      employee.terminatedAt < end
        ? employee.terminatedAt
        : null;
    let severance: ReturnType<typeof terminationPay> | undefined;
    if (terminatedAt && !employee.terminationReason)
      blockers.push('terminationReasonRequired');
    else if (
      terminatedAt &&
      (owesSeverance(employee.terminationReason) ||
        owesNotice(employee.terminationReason))
    ) {
      const pensionScheme = pensionApplicable(employee.legalStatus);
      const legacySeniority =
        pensionScheme && employee.hiredAt < NEW_PENSION_SYSTEM_START;
      // 契約終止時才發的特休未休工資屬終止後所得，不計入平均工資；年度終結發的要計入
      const terminationAnnualPay = annual.reduce(
        (sum, settlement, index) =>
          settlement.endsAt === terminatedAt.toISOString()
            ? sum + BigInt(annualLeavePayoutCents[index])
            : sum,
        0n,
      );
      const dailyWageCents = legacySeniority
        ? null
        : await averageDailyWage(tx, {
            employee,
            terminatedAt,
            currentMonth: month,
            currentWageCents:
              BigInt(wages.grossCents) -
              terminationAnnualPay -
              injuryCompensation -
              wages.lines
                .filter(({ code }) => code === 'bonus')
                .reduce(
                  (sum, { amountCents }) => sum + BigInt(amountCents),
                  0n,
                ),
            termsAt,
            hourly: profile.terms.salaryType === 'hourly',
          });
      if (legacySeniority) blockers.push('legacySeniorityUnsupported');
      else if (dailyWageCents === null)
        blockers.push('averageWageStatementsRequired');
      else {
        if (rules.withholdingTable.year !== taxYear)
          blockers.push('withholdingTableOutdated');
        severance = terminationPay({
          dailyWageCents,
          employee,
          pensionScheme,
          terminatedAt,
          terms: profile.terms,
          weeklyMinutes: weeklyMinutesAt(hours, terminatedAt),
          table: rules.withholdingTable,
          nonResident,
          exemptTaxCents: BigInt(rules.withholdingExemptTaxCents),
        });
      }
    }
    const calculated = severance ? payroll(severance).statement : wages;
    return {
      ...calculated,
      ...(severance && {
        retirementIncomeCents: severance.retirementIncomeCents,
      }),
      nonResident,
      ...(paidOn && { paidOn }),
      terms: profile.terms,
      ruleVersion: ruleSet.ruleVersion,
      blockers: [...new Set([...blockers, ...calculated.blockers])],
      sourceFingerprint: createHash('sha256')
        .update(
          JSON.stringify({
            // 改到計算結果就要換版號，否則覆核過的舊草稿會以舊算法通過發布
            calculationVersion: 'statutory-automation-4',
            overtimeAgreedFrom,
            overtimeExtensionPeriods,
            occupationalAccidentRateMicros,
            paidOn,
            holidays,
            laborMandatory,
            businessDays: businessDays && [...businessDays],
            medical: medical
              ? { records: medical.records, shifts: medical.shifts }
              : null,
            profile,
            ruleSet: rules,
            shifts,
            adjacentShifts,
            events,
            requests: requests.map((request) =>
              leaveTypes.some(
                (type) =>
                  type.id === request.leaveTypeId &&
                  type.statutoryKind === 'parental',
              )
                ? clipToPeriod(request, start, end)
                : request,
            ),
            pendingParentalReturns,
            leaveTypes,
            employee,
            calendarCases,
            annualRequests,
            annualDeferrals,
            annual,
            termsHistory,
            substitutes,
            severance,
            earnings,
            bonusYearToDateCents,
          }),
        )
        .digest('hex'),
    };
  }

  async employerHealthSupplement(actor: AttendanceActor, month: string) {
    const { start, end } = payrollPeriod(month);
    const ruleSet = await this.ruleSets.resolve(this.db, month);
    if (!ruleSet) throw badRequestError('payrollRuleSetMissing');
    const [paid, insuredStatements, employees] = await Promise.all([
      this.db
        .select({ snapshot: payrollStatement.snapshot })
        .from(payrollStatement)
        .where(
          and(
            eq(payrollStatement.organizationId, actor.organizationId),
            eq(payrollStatement.status, 'published'),
            gte(payrollStatement.paidOn, `${month}-01`),
            lt(payrollStatement.paidOn, platformDateString(end)),
          ),
        ),
      this.db
        .select({
          employeeId: payrollStatement.employeeId,
          snapshot: payrollStatement.snapshot,
        })
        .from(payrollStatement)
        .where(
          and(
            eq(payrollStatement.organizationId, actor.organizationId),
            eq(payrollStatement.status, 'published'),
            eq(payrollStatement.month, month),
          ),
        ),
      this.db
        .select({
          id: attendanceEmployee.id,
          terminatedAt: attendanceEmployee.terminatedAt,
        })
        .from(attendanceEmployee)
        .where(
          and(
            eq(attendanceEmployee.organizationId, actor.organizationId),
            lt(attendanceEmployee.hiredAt, end),
            or(
              isNull(attendanceEmployee.terminatedAt),
              gt(attendanceEmployee.terminatedAt, start),
            ),
          ),
        ),
    ]);
    const salaryCents = paid.reduce(
      (sum, { snapshot }) => sum + salaryIncomeCents(snapshot),
      0n,
    );
    const insuredCents = insuredStatements.reduce(
      (sum, { employeeId, snapshot }) => {
        const employee = employees.find(({ id }) => id === employeeId);
        const insuredAtMonthEnd =
          !!employee &&
          (!employee.terminatedAt || employee.terminatedAt >= end);
        return insuredAtMonthEnd && snapshot.terms.insurance
          ? sum + BigInt(snapshot.terms.insurance.healthBasis) * 100n
          : sum;
      },
      0n,
    );
    const base = salaryCents > insuredCents ? salaryCents - insuredCents : 0n;
    return {
      month,
      salaryCents: salaryCents.toString(),
      insuredCents: insuredCents.toString(),
      premiumCents: (
        ((base * BigInt(ruleSet.rules.healthSupplementRateBp) + 500000n) /
          1000000n) *
        100n
      ).toString(),
      unpublishedEmployees: employees.filter(
        ({ id }) =>
          !insuredStatements.some(({ employeeId }) => employeeId === id),
      ).length,
    };
  }

  async draft(actor: AttendanceActor, dto: PayrollDraftDto) {
    const reason = dto.reason?.trim() ?? '';
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [existing] = await tx
        .select()
        .from(payrollStatement)
        .where(
          and(
            eq(payrollStatement.organizationId, actor.organizationId),
            eq(payrollStatement.idempotencyKey, dto.idempotencyKey),
          ),
        );
      if (existing) {
        if (
          existing.employeeId !== dto.employeeId ||
          existing.month !== dto.month ||
          existing.reason !== reason
        )
          throw conflictError('idempotencyConflict');
        return existing;
      }
      const employee = await this.payrollEmployee(tx, actor, dto.employeeId);
      const period = payrollPeriod(dto.month);
      await assertPayrollUnlocked(
        tx,
        actor.organizationId,
        dto.employeeId,
        period.start,
        period.end,
      );
      if (dto.earnings)
        await this.earnings.replaceEarnings(
          tx,
          actor,
          dto.employeeId,
          dto.month,
          dto.earnings,
        );
      const snapshot = await this.snapshot(
        tx,
        actor,
        dto.employeeId,
        dto.month,
        employee,
        await this.payrollSettings(tx, actor.organizationId, dto.month),
      );
      const calculation = {
        employeeName: employee.name,
        idempotencyKey: dto.idempotencyKey,
        status: 'draft' as const,
        snapshot,
        paidOn: snapshot.paidOn ?? null,
        reason,
        createdBy: actor.userId,
        reviewedBy: null,
        reviewedAt: null,
      };
      const [row] = await tx
        .insert(payrollStatement)
        .values({
          id: randomUUID(),
          organizationId: actor.organizationId,
          employeeId: dto.employeeId,
          month: dto.month,
          ...calculation,
        })
        .onConflictDoUpdate({
          target: [payrollStatement.employeeId, payrollStatement.month],
          set: calculation,
        })
        .returning();
      await writeAudit(tx, actor, 'payroll.draft', row.id, {
        employeeId: dto.employeeId,
        month: dto.month,
        idempotencyKey: dto.idempotencyKey,
      });
      return row;
    });
  }

  async draftBatch(
    actor: AttendanceActor,
    { month, reason }: PayrollBatchDraftDto,
  ) {
    const period = payrollPeriod(month);
    const employees = await this.db
      .select({ id: attendanceEmployee.id })
      .from(attendanceEmployee)
      .where(
        and(
          eq(attendanceEmployee.organizationId, actor.organizationId),
          lt(attendanceEmployee.hiredAt, period.end),
          or(
            isNull(attendanceEmployee.terminatedAt),
            gt(attendanceEmployee.terminatedAt, period.start),
          ),
          sql`NOT EXISTS (SELECT 1 FROM ${payrollStatement}
            WHERE ${payrollStatement.employeeId} = ${attendanceEmployee.id}
              AND ${payrollStatement.month} = ${month}
              AND ${payrollStatement.status} <> 'draft')`,
        ),
      )
      .orderBy(asc(attendanceEmployee.id));
    return runBatch(
      employees.map(({ id }) => id),
      (employeeId) =>
        this.draft(actor, {
          employeeId,
          idempotencyKey: randomUUID(),
          month,
          reason,
        }),
    );
  }

  transitionBatch(
    actor: AttendanceActor,
    status: 'reviewed' | 'published',
    { ids, reason }: PayrollBatchReviewDto,
  ) {
    return runBatch(ids, (id) => this.transition(actor, id, status, reason));
  }

  async transition(
    actor: AttendanceActor,
    id: string,
    status: 'reviewed' | 'published',
    reason = '',
  ) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [row] = await tx
        .select()
        .from(payrollStatement)
        .where(
          and(
            eq(payrollStatement.id, id),
            eq(payrollStatement.organizationId, actor.organizationId),
          ),
        );
      if (!row) throw new NotFoundException();
      if (row.status === status) return row;
      const subject = await this.payrollEmployee(tx, actor, row.employeeId);
      await assertIndependentReview(tx, actor, 'payslip', [subject.userId]);
      if (status === 'reviewed')
        await assertIndependentReview(
          tx,
          actor,
          'payslip',
          [row.createdBy, subject.userId],
          'cannotReviewOwnDraft',
        );
      if (row.status !== (status === 'reviewed' ? 'draft' : 'reviewed'))
        throw conflictError('invalidPayrollState');
      const current = await this.snapshot(
        tx,
        actor,
        row.employeeId,
        row.month,
        subject,
        await this.payrollSettings(tx, actor.organizationId, row.month),
      );
      if (
        current.ruleVersion !== row.snapshot.ruleVersion ||
        current.sourceFingerprint !== row.snapshot.sourceFingerprint
      )
        throw conflictError('payrollSourceChanged');
      if (current.blockers.length) throw conflictError('payrollBlocked');
      const [result] = await tx
        .update(payrollStatement)
        .set(
          status === 'reviewed'
            ? { status, reviewedBy: actor.userId, reviewedAt: new Date() }
            : { status, publishedAt: new Date() },
        )
        .where(eq(payrollStatement.id, id))
        .returning();
      await writeAudit(tx, actor, `payroll.${status}`, id, {
        reason: reason.trim(),
      });
      return result;
    });
  }
}
