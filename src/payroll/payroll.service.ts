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
  forbiddenError,
} from 'src/attendance/attendance-errors';
import {
  countedIntervals,
  countedRequestStatuses,
  ADULT_WORKING_AGE,
  ageOn,
  childLaborViolation,
  exceedsStudentWeeklyLimit,
  hasShortRestBetweenShifts,
  lacksWeeklyRest,
  EXTENDED_MONTHLY_OVERTIME_SECONDS,
  intersectIntervals,
  punchedUnpaidBreaks,
  subtractIntervals,
  leadingIntervals,
  MAX_MONTHLY_OVERTIME_SECONDS,
  overlapIntervals,
  overtimeExtensionPeriodOf,
  scheduledWorkIntervals,
  scheduledWorkSeconds,
  summarizeEvents,
  type TimeInterval,
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
} from 'src/db/schema/attendance';
import {
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

import { annualLeaveSettlement } from './annual-leave';
import { PayrollDraftDto } from './dto/payroll-draft.dto';
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
import { PayrollRulesService } from './payroll-rules.service';
import {
  currentGrade,
  deriveInsurance,
  insuranceGrade,
  insuranceViolations,
  laborGradesFor,
} from './taiwan-rules';

const knownFullTime = (hours: EmployeeHours, at: Date) => {
  const weeklyMinutes = averageWeeklyMinutes(hours, at);

  return weeklyMinutes !== null && employmentType(weeklyMinutes) === 'fullTime';
};

interface PayrollSettings {
  overtimeExtensionPeriods: string[];
  occupationalAccidentRateMicros: number | null;
  holidays: string[] | null;
}

const NO_PAYROLL_SETTINGS: PayrollSettings = {
  overtimeExtensionPeriods: [],
  occupationalAccidentRateMicros: null,
  holidays: [],
};

const employeeHeadcount = async (
  tx: Transaction,
  organizationId: string,
  start: Date,
  end: Date,
) => {
  const [{ total }] = await tx
    .select({ total: count() })
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
        or(
          isNull(attendanceEmployee.terminatedAt),
          gt(attendanceEmployee.terminatedAt, start),
        ),
      ),
    );
  return total;
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
  terms: Pick<PayrollTerms, 'allowanceCents' | 'salaryCents' | 'salaryType'>,
  weeklyMinutes: number,
) =>
  (Number(terms.salaryCents) *
    (terms.salaryType === 'hourly'
      ? (weeklyMinutes / 60) * WEEKS_PER_MONTH
      : 1) +
    Number(terms.allowanceCents)) /
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
      const context = {
        age: employee.birthDate
          ? ageOn(employee.birthDate, effectiveFrom)
          : null,
        headcount: await employeeHeadcount(
          tx,
          actor.organizationId,
          period.start,
          period.end,
        ),
        legalStatus: employee.legalStatus,
        weeklyMinutes: weeklyMinutesAt(hours, date),
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
            voluntaryPensionCents: '0',
            employerPensionCents: '0',
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
        overtimeExtensionPeriods: attendanceSettings.overtimeExtensionPeriods,
        occupationalAccidentRateMicros:
          attendanceSettings.occupationalAccidentRateMicros,
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
      holidays,
      occupationalAccidentRateMicros,
      overtimeExtensionPeriods,
    } = NO_PAYROLL_SETTINGS,
  ): Promise<PayrollSnapshot> {
    const employee =
      knownEmployee ?? (await this.payrollEmployee(tx, actor, employeeId));
    const { start, end } = payrollPeriod(month);
    const hours = await loadOneEmployeeHours(tx, employee);
    const [profile] = await tx
      .select()
      .from(payrollTerms)
      .where(
        and(
          eq(payrollTerms.organizationId, actor.organizationId),
          eq(payrollTerms.employeeId, employeeId),
          lte(payrollTerms.effectiveFrom, start),
        ),
      )
      .orderBy(desc(payrollTerms.effectiveFrom), desc(payrollTerms.version))
      .limit(1);
    if (!profile) throw badRequestError('payrollTermsRequired');
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
    const headcount = insurance
      ? await employeeHeadcount(tx, actor.organizationId, start, end)
      : 0;
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
        BigInt(profile.terms.allowanceCents) > 0n) &&
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
    if (parentalLeaves.length && insurance && !insurance.manualPremiums)
      blockers.push('parentalInsuranceRequired');
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
        : 0n) + BigInt(profile.terms.allowanceCents);
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
        dayKind: string;
        scheduledSeconds: number;
        scheduledOffsetSeconds: number;
        paidLeaveSeconds: number;
        parentalScheduledSeconds: number;
      }
    >();
    const intervalsByDay = new Map<string, TimeInterval[]>();
    let leaveDeductionSeconds = 0;
    let absenceSeconds = 0;
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
      intervalsByDay.set(key, [...(intervalsByDay.get(key) ?? []), ...payable]);
      if (shift.dayKind === 'workday' && summary.state === 'completed')
        absenceSeconds += subtractIntervals(workIntervals, [
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
    if (
      hasShortRestBetweenShifts(
        adjacentShifts,
        (shift) => shift.startsAt >= start && shift.startsAt < end,
      )
    )
      blockers.push('shiftRestTooShort');
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
    if (insurance) {
      const employedDates: string[] = [];
      for (
        let time = Math.max(start.getTime(), employee.hiredAt.getTime());
        time <
        Math.min(end.getTime(), employee.terminatedAt?.getTime() ?? Infinity);
        time += DAY_MS
      )
        employedDates.push(platformDateString(new Date(time)));
      const openDates = employedDates.filter((date) =>
        businessDays?.has((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7),
      );
      blockers.push(
        ...insuranceViolations(insurance, {
          age: employee.birthDate
            ? ageOn(employee.birthDate, platformDateString(start))
            : null,
          headcount,
          legalStatus: employee.legalStatus,
          weeklyMinutes: weeklyMinutesAt(hours, end),
          worksEveryBusinessDay:
            openDates.length > 0 &&
            openDates.every((date) => {
              const day = days.get(date);
              return !!day && (day.seconds > 0 || day.scheduledSeconds > 0);
            }),
        }),
      );
    }
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
    const annual = annualPolicies.length
      ? annualLeaveSettlement({
          hiredAt: employee.hiredAt,
          terminatedAt: employee.terminatedAt,
          weeklyMinutesAt: weeklyMinutesOf(hours),
          start,
          end,
          terms: profile.terms,
          leaves: annualRequests,
        })
      : { amountCents: '0', settlements: [] };
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
    const calculated = calculatePayroll(
      ruleSet.rules,
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
        ...employment,
        contributionDays: contributionCoverageDays(
          start,
          end,
          employee.hiredAt,
          employee.terminatedAt,
          parentalLeaves,
        ),
        nonResident:
          employee.legalStatus !== 'national' &&
          (!employee.taiwanStaySince ||
            taiwanStayDays(employee.taiwanStaySince, end) < TAX_RESIDENCY_DAYS),
        employerHealthCharged:
          employment.healthCharged &&
          !parentalLeaves.some(
            (leave) => leave.startsAt < end && leave.endsAt >= end,
          ),
        occupationalAccidentRateMicros,
        annualLeavePayoutCents: annual.amountCents,
        calendarLeaveDeductionCents: calendarDeduction.toString(),
        calendarLeavePayCents: calendarPay.toString(),
        monthlyOvertimeLimitSeconds: overtimeExtensionPeriodOf(
          overtimeExtensionPeriods,
          Number(month.slice(0, 4)),
          Number(month.slice(5, 7)) - 1,
        )
          ? EXTENDED_MONTHLY_OVERTIME_SECONDS
          : MAX_MONTHLY_OVERTIME_SECONDS,
      },
    );
    return {
      ...calculated,
      terms: profile.terms,
      ruleVersion: ruleSet.ruleVersion,
      blockers: [...new Set([...blockers, ...calculated.blockers])],
      sourceFingerprint: createHash('sha256')
        .update(
          JSON.stringify({
            // 改到計算結果就要換版號，否則覆核過的舊草稿會以舊算法通過發布
            calculationVersion: 'social-insurance-1',
            overtimeExtensionPeriods,
            occupationalAccidentRateMicros,
            holidays,
            headcount,
            businessDays: businessDays && [...businessDays],
            medical: medical
              ? { records: medical.records, shifts: medical.shifts }
              : null,
            profile,
            ruleSet: ruleSet.rules,
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
            annual,
          }),
        )
        .digest('hex'),
    };
  }

  async draft(actor: AttendanceActor, dto: PayrollDraftDto) {
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
          existing.reason !== dto.reason
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
        reason: dto.reason,
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

  async transition(
    actor: AttendanceActor,
    id: string,
    status: 'reviewed' | 'published',
    reason: string,
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
      if (subject.userId === actor.userId)
        throw forbiddenError('cannotReviewSelf');
      if (status === 'reviewed' && row.createdBy === actor.userId)
        throw forbiddenError('cannotReviewOwnDraft');
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
      await writeAudit(tx, actor, `payroll.${status}`, id, { reason });
      return result;
    });
  }
}
