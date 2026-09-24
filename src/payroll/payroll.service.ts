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
  lt,
  lte,
  ne,
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
  hasScheduledUnpaidBreak,
  leadingIntervals,
  overlapIntervals,
  scheduledWorkIntervals,
  scheduledWorkSeconds,
  summarizeEvents,
  type TimeInterval,
} from 'src/attendance/attendance-rules';
import {
  averageWeeklyMinutes,
  employmentType,
  loadOneEmployeeHours,
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
  attendanceShift,
} from 'src/db/schema/attendance';
import {
  payrollStatement,
  payrollTerms,
  type PayrollBlocker,
  type PayrollSnapshot,
} from 'src/db/schema/payroll';
import { user } from 'src/db/schema/users';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import { annualLeaveSettlement } from './annual-leave';
import { PayrollDraftDto } from './dto/payroll-draft.dto';
import {
  PAYROLL_STATEMENT_ENUM_FILTER_FIELDS,
  PAYROLL_STATEMENT_NUMBER_FILTER_FIELDS,
  PAYROLL_STATEMENT_STRING_FILTER_FIELDS,
  PayrollStatementPaginationQueryDto,
} from './dto/payroll-statement-pagination-query.dto';
import { PayrollTermsDto } from './dto/payroll-terms.dto';
import {
  calculatePayroll,
  payrollPeriod,
  roundRatio,
  uncoveredOvertime,
} from './payroll-calculation';
import {
  calendarLeavePay,
  clipToPeriod,
  employmentPeriod,
  exceedsWeeklySchedule,
  intervalSeconds,
  periodWork,
} from './payroll-period';
import { PayrollRulesService } from './payroll-rules.service';
import { currentGrade, laborGradesFor } from './taiwan-rules';

const knownFullTime = (hours: EmployeeHours, at: Date) => {
  const weeklyMinutes = averageWeeklyMinutes(hours, at);

  return weeklyMinutes !== null && employmentType(weeklyMinutes) === 'fullTime';
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

  async insuranceGrades(month: string) {
    const ruleSet = await this.ruleSets.resolve(this.db, month);
    if (!ruleSet) throw new NotFoundException('payrollRuleSetMissing');
    const { healthGrades, laborGrades, partTimeLaborGrades } = ruleSet.rules;
    return {
      effectiveFrom: ruleSet.effectiveFrom,
      healthGrades,
      laborGrades,
      partTimeLaborGrades,
    };
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
      if (terms.insurance) {
        const ruleSet = await this.ruleSets.resolve(
          tx,
          effectiveFrom.slice(0, 7),
        );
        if (!ruleSet) throw badRequestError('payrollRuleSetMissing');
        if (
          terms.insurance.laborLadder === 'partTime' &&
          knownFullTime(await loadOneEmployeeHours(tx, employee), date)
        )
          throw badRequestError('partTimeLadderRequiresPartTime');
        if (
          (terms.insurance.laborCoverage !== 'none' &&
            terms.insurance.laborBasis <= 0) ||
          terms.insurance.pensionBasis <= 0 ||
          !currentGrade(
            terms.insurance.laborBasis,
            laborGradesFor(ruleSet.rules, terms.insurance),
          ) ||
          !currentGrade(terms.insurance.healthBasis, ruleSet.rules.healthGrades)
        )
          throw badRequestError('invalidInsuranceBasis');
      }
      if (!terms.sourceNote.trim()) throw badRequestError('sourceRequired');
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
          terms,
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
      version: payrollStatement.version,
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
            PAYROLL_STATEMENT_NUMBER_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: PAYROLL_STATEMENT_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(payrollStatement.employeeName, `%${value}%`),
          ilike(payrollStatement.month, `%${value}%`),
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
            : [desc(payrollStatement.month), desc(payrollStatement.version)]),
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

  private async snapshot(
    tx: Transaction,
    actor: AttendanceActor,
    employeeId: string,
    month: string,
    knownEmployee?: typeof attendanceEmployee.$inferSelect,
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
        !currentGrade(insurance.healthBasis, ruleSet.rules.healthGrades))
    )
      blockers.push('insuranceBasisOutdated');
    if (insurance?.laborLadder === 'partTime' && knownFullTime(hours, start))
      blockers.push('partTimeLadderRequiresPartTime');
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
    if (parentalLeaves.length && profile.terms.insurance)
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
      intervalsByDay.set(key, [...(intervalsByDay.get(key) ?? []), ...counted]);
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
      const overtimeSeconds = Math.max(0, summary.workedSeconds - workSeconds);
      if (
        overtimeSeconds > 0 &&
        !requests.some(
          (request) =>
            request.shiftId === shift.id &&
            request.kind === 'overtime' &&
            request.status === 'approved' &&
            (request.endsAt.getTime() - request.startsAt.getTime()) / 1000 >=
              overtimeSeconds,
        )
      )
        blockers.push('unresolvedOvertime');
      if (
        summary.state === 'completed' &&
        summary.workedSeconds + leaveSeconds <
          workSeconds -
            (hasScheduledUnpaidBreak(shift) ? 0 : summary.unpaidBreakSeconds)
      )
        blockers.push('attendanceShortfall');
    }
    const approvals = requests
      .filter(
        (request) =>
          request.kind === 'overtime' && request.status === 'approved',
      )
      .map((request) => ({
        start: request.startsAt.getTime(),
        end: request.endsAt.getTime(),
      }));
    for (const [key, intervals] of intervalsByDay) {
      Object.assign(days.get(key)!, periodWork(intervals, start, end));
      if (
        days.get(key)!.seconds > 0 &&
        uncoveredOvertime(intervals, approvals, days.get(key)!.dayKind) > 0
      )
        blockers.push('unresolvedOvertime');
    }
    if (exceedsWeeklySchedule(adjacentShifts, start, end))
      blockers.push('weeklyScheduleRequiresReview');
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
        ...employment,
        annualLeavePayoutCents: annual.amountCents,
        calendarLeaveDeductionCents: calendarDeduction.toString(),
        calendarLeavePayCents: calendarPay.toString(),
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
            calculationVersion: 'medical-parental-5',
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
      );
      const [previous] = await tx
        .select()
        .from(payrollStatement)
        .where(
          and(
            eq(payrollStatement.employeeId, dto.employeeId),
            eq(payrollStatement.month, dto.month),
          ),
        )
        .orderBy(desc(payrollStatement.version))
        .limit(1);
      const [row] = await tx
        .insert(payrollStatement)
        .values({
          id: randomUUID(),
          organizationId: actor.organizationId,
          employeeId: dto.employeeId,
          employeeName: employee.name,
          month: dto.month,
          idempotencyKey: dto.idempotencyKey,
          version: (previous?.version ?? 0) + 1,
          snapshot,
          reason: dto.reason,
          createdBy: actor.userId,
        })
        .returning();
      await writeAudit(tx, actor, 'payroll.draft', row.id, {
        employeeId: dto.employeeId,
        month: dto.month,
        idempotencyKey: dto.idempotencyKey,
        version: row.version,
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
      const [latest] = await tx
        .select({ id: payrollStatement.id })
        .from(payrollStatement)
        .where(
          and(
            eq(payrollStatement.employeeId, row.employeeId),
            eq(payrollStatement.month, row.month),
          ),
        )
        .orderBy(desc(payrollStatement.version))
        .limit(1);
      if (latest.id !== row.id) throw conflictError('payrollSourceChanged');
      if (row.status !== (status === 'reviewed' ? 'draft' : 'reviewed'))
        throw conflictError('invalidPayrollState');
      const current = await this.snapshot(
        tx,
        actor,
        row.employeeId,
        row.month,
        subject,
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

  async reopen(actor: AttendanceActor, id: string, reason: string) {
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
      if (row.reopenedAt) return row;
      if (row.status !== 'published')
        throw conflictError('invalidPayrollState');
      const subject = await this.payrollEmployee(tx, actor, row.employeeId);
      if (subject.userId === actor.userId)
        throw forbiddenError('cannotReviewSelf');
      const [result] = await tx
        .update(payrollStatement)
        .set({
          reopenedBy: actor.userId,
          reopenedAt: new Date(),
          reopenReason: reason,
        })
        .where(eq(payrollStatement.id, id))
        .returning();
      await writeAudit(tx, actor, 'payroll.reopened', id, { reason });
      return result;
    });
  }
}
