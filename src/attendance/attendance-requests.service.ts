import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  ne,
  or,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
  DAY_MS,
  platformDateString,
  platformMonthStart,
  toPlatformTime,
} from 'src/common/constants/timezone';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';
import {
  attendanceEmployee,
  attendanceEvent,
  attendanceLeaveBalance,
  attendanceLeaveCase,
  attendanceLeaveType,
  attendanceParentalReturn,
  attendanceRequest,
  attendanceShift,
} from 'src/db/schema/attendance';
import { user } from 'src/db/schema/users';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import type { AttendanceActor } from './attendance-actor';
import {
  assertPayrollUnlocked,
  lockOrganization,
  writeAudit,
  type Transaction,
} from './attendance-audit';
import {
  badRequestError,
  conflictError,
  forbiddenError,
} from './attendance-errors';
import {
  blockingRequestStatuses,
  countedRequestStatuses,
  CORRECTION_LEAD_MS,
  MAX_DAILY_WORK_SECONDS,
  MAX_MONTHLY_OVERTIME_SECONDS,
  MAX_SHIFT_MS,
  scheduledWorkSeconds,
  summarizeEvents,
} from './attendance-rules';
import {
  ATTENDANCE_REQUEST_DATE_FILTER_FIELDS,
  ATTENDANCE_REQUEST_ENUM_FILTER_FIELDS,
  ATTENDANCE_REQUEST_STRING_FILTER_FIELDS,
  AttendanceRequestPaginationQueryDto,
} from './dto/attendance-request-pagination-query.dto';
import { CreateAttendanceRequestDto } from './dto/create-attendance-request.dto';
import { ReviewAttendanceRequestDto } from './dto/review-attendance-request.dto';
import { weeklyMinutesAt, weeklyMinutesOf } from './employee-hours';
import { requireActiveEmployee, requireEmployee } from './employee-lookup';
import {
  countedLeaves,
  leaveBalanceRow,
  leaveCaseUsage,
  leaveMinutes,
  leaveYear,
  matchLeaveCase,
  statutoryBalance,
} from './leave-ledger';
import {
  calendarLeaveMinutes,
  effectivePaidPercent,
  isCalendarLeave,
  isEventLeave,
  requiresMedicalCertificate,
  statutoryLeavePeriod,
} from './leave-rules';
import {
  isMedicalLeave,
  loadMedicalLedger,
  MAX_MEDICAL_LEAVE_MS,
} from './medical-leave';
import { parentalLeaveErrors } from './parental-leave';
import { assertNoParentalReturn } from './parental-ledger';
import { parseInterval } from './shift-intervals';
import { unfinishedShift } from './shift-queries';

type AttendanceRequestRow = typeof attendanceRequest.$inferSelect;

type AttendanceShiftRow = typeof attendanceShift.$inferSelect;

const startedBetween = (from: Date, to: Date) =>
  and(
    sql`${attendanceRequest.startsAt} >= ${from}`,
    lt(attendanceRequest.startsAt, to),
  )!;

@Injectable()
export class AttendanceRequestsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async requests(
    actor: AttendanceActor,
    query: AttendanceRequestPaginationQueryDto,
    mine: boolean,
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
    const employeeId = mine
      ? (await requireEmployee(actor, this.db)).id
      : undefined;
    const fieldMap: Record<string, Column | SQL> = {
      employeeName: user.name,
      leaveTypeName: attendanceLeaveType.name,
      leaveTypeStatutoryKind: attendanceLeaveType.statutoryKind,
      reason: attendanceRequest.reason,
      reviewReason: attendanceRequest.reviewReason,
      startsAt: attendanceRequest.startsAt,
      endsAt: attendanceRequest.endsAt,
      kind: attendanceRequest.kind,
      status: attendanceRequest.status,
    };
    const where = and(
      eq(attendanceRequest.organizationId, actor.organizationId),
      employeeId ? eq(attendanceRequest.employeeId, employeeId) : undefined,
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            ATTENDANCE_REQUEST_STRING_FILTER_FIELDS,
            ATTENDANCE_REQUEST_DATE_FILTER_FIELDS,
            ATTENDANCE_REQUEST_ENUM_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: ATTENDANCE_REQUEST_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(user.name, `%${value}%`),
          ilike(attendanceLeaveType.name, `%${value}%`),
          ilike(attendanceRequest.reason, `%${value}%`),
          ilike(attendanceRequest.reviewReason, `%${value}%`),
          ilike(localTimeText(attendanceRequest.startsAt), `%${value}%`),
          ilike(localTimeText(attendanceRequest.endsAt), `%${value}%`),
        ],
      }),
    );
    const sort = sortDirection === 'asc' ? asc : desc;
    const [data, [{ total }]] = await Promise.all([
      this.db
        .select({
          request: attendanceRequest,
          employeeName: user.name,
          leaveTypeName: attendanceLeaveType.name,
          leaveTypeStatutoryKind: attendanceLeaveType.statutoryKind,
          returnPending: sql<boolean>`EXISTS (SELECT 1 FROM ${attendanceParentalReturn} pending
            WHERE pending.request_id = ${attendanceRequest.id} AND pending.status = 'pending')`,
        })
        .from(attendanceRequest)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceRequest.employeeId),
        )
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .leftJoin(
          attendanceLeaveType,
          eq(attendanceLeaveType.id, attendanceRequest.leaveTypeId),
        )
        .where(where)
        .orderBy(
          sort(sortBy ? fieldMap[sortBy] : attendanceRequest.createdAt),
          asc(attendanceRequest.id),
        )
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(attendanceRequest)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceRequest.employeeId),
        )
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .leftJoin(
          attendanceLeaveType,
          eq(attendanceLeaveType.id, attendanceRequest.leaveTypeId),
        )
        .where(where),
    ]);
    return {
      data: data.map(
        ({
          request,
          employeeName,
          leaveTypeName,
          leaveTypeStatutoryKind,
          returnPending,
        }) => ({
          ...request,
          employeeName,
          leaveTypeName,
          leaveTypeStatutoryKind,
          returnPending,
        }),
      ),
      total,
    };
  }

  async createRequest(actor: AttendanceActor, dto: CreateAttendanceRequestDto) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const employee = await requireActiveEmployee(actor, tx);
      const interval = parseInterval(dto.startsAt, dto.endsAt);
      if (!dto.reason.trim()) throw badRequestError('reasonRequired');
      if (dto.kind === 'leave') {
        if (!dto.leaveTypeId) throw badRequestError('leavePolicyRequired');
        const [policy] = await tx
          .select()
          .from(attendanceLeaveType)
          .where(
            and(
              eq(attendanceLeaveType.id, dto.leaveTypeId),
              eq(attendanceLeaveType.organizationId, actor.organizationId),
              eq(attendanceLeaveType.enabled, true),
            ),
          );
        if (!policy) throw badRequestError('leavePolicyRequired');
        if (
          policy.statutoryKind === 'parental'
            ? !dto.parentalMode
            : !!dto.parentalMode
        )
          throw badRequestError('invalidParentalInterval');
        if (
          !isEventLeave(policy.statutoryKind) &&
          !isMedicalLeave(policy.statutoryKind) &&
          leaveYear(interval.startsAt) !==
            leaveYear(new Date(interval.endsAt.getTime() - 1))
        )
          throw badRequestError('splitLeaveByYear');
        const [overlap] = await tx
          .select({ id: attendanceRequest.id })
          .from(attendanceRequest)
          .where(
            and(
              eq(attendanceRequest.employeeId, employee.id),
              eq(attendanceRequest.kind, 'leave'),
              inArray(attendanceRequest.status, blockingRequestStatuses),
              lt(attendanceRequest.startsAt, interval.endsAt),
              sql`${attendanceRequest.endsAt} > ${interval.startsAt}`,
            ),
          )
          .limit(1);
        if (overlap) throw conflictError('overlappingLeave');
        if (isEventLeave(policy.statutoryKind)) {
          await matchLeaveCase(
            tx,
            actor.organizationId,
            employee.id,
            policy.id,
            dto.leaveCaseId,
            interval.startsAt,
            interval.endsAt,
          );
        } else if (dto.leaveCaseId) throw badRequestError('invalidLeaveCase');
        const { minutes } = await this.requestedLeave(tx, employee, policy, {
          id: 'proposed',
          ...interval,
        });

        const [row] = await tx
          .insert(attendanceRequest)
          .values({
            id: randomUUID(),
            organizationId: actor.organizationId,
            employeeId: employee.id,
            kind: 'leave',
            ...interval,
            leaveTypeId: policy.id,
            leaveCaseId: dto.leaveCaseId,
            parentalMode: dto.parentalMode,
            reason: dto.reason.trim(),
          })
          .returning();
        await writeAudit(tx, actor, 'request.create', row.id, {
          kind: dto.kind,
          minutes,
        });
        return row;
      }
      if (!dto.shiftId) throw badRequestError('shiftRequired');
      const [shift] = await tx
        .select()
        .from(attendanceShift)
        .where(
          and(
            eq(attendanceShift.id, dto.shiftId),
            eq(attendanceShift.organizationId, actor.organizationId),
            eq(attendanceShift.employeeId, employee.id),
            ne(attendanceShift.status, 'cancelled'),
          ),
        );
      if (!shift) throw new NotFoundException();
      if (dto.kind === 'overtime')
        await this.assertOvertimeFits(tx, shift, interval);
      if (dto.kind === 'correction') {
        if (
          !dto.correctedEvents ||
          summarizeEvents(dto.correctedEvents, shift.paidBreak).state !==
            'completed'
        )
          throw badRequestError('invalidEventSequence');
        if (
          interval.endsAt.getTime() - interval.startsAt.getTime() >
            MAX_SHIFT_MS ||
          interval.startsAt.getTime() <
            shift.startsAt.getTime() - CORRECTION_LEAD_MS ||
          interval.endsAt.getTime() > shift.endsAt.getTime() + DAY_MS
        )
          throw badRequestError('invalidInterval');
        if (
          dto.correctedEvents.some(
            (event) => new Date(event.occurredAt) > new Date(),
          )
        )
          throw badRequestError('futureCorrection');
        if (
          new Date(dto.correctedEvents[0].occurredAt).getTime() !==
            interval.startsAt.getTime() ||
          new Date(dto.correctedEvents.at(-1)!.occurredAt).getTime() !==
            interval.endsAt.getTime()
        )
          throw badRequestError('invalidInterval');
      }
      const [pending] = await tx
        .select({ id: attendanceRequest.id })
        .from(attendanceRequest)
        .where(
          and(
            eq(attendanceRequest.shiftId, shift.id),
            eq(attendanceRequest.kind, dto.kind),
            eq(attendanceRequest.status, 'pending'),
          ),
        )
        .limit(1);
      if (pending) throw conflictError('pendingRequestExists');
      const [row] = await tx
        .insert(attendanceRequest)
        .values({
          id: randomUUID(),
          organizationId: actor.organizationId,
          employeeId: employee.id,
          shiftId: shift.id,
          kind: dto.kind,
          ...interval,
          reason: dto.reason.trim(),
          correctedEvents:
            dto.kind === 'correction' ? dto.correctedEvents : null,
        })
        .returning();
      await writeAudit(tx, actor, 'request.create', row.id, { kind: dto.kind });
      return row;
    });
  }

  async review(
    actor: AttendanceActor,
    id: string,
    dto: ReviewAttendanceRequestDto,
  ) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [row] = await tx
        .select({
          request: attendanceRequest,
          userId: attendanceEmployee.userId,
        })
        .from(attendanceRequest)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceRequest.employeeId),
        )
        .where(
          and(
            eq(attendanceRequest.id, id),
            eq(attendanceRequest.organizationId, actor.organizationId),
          ),
        );
      if (!row) throw new NotFoundException();
      if (row.userId === actor.userId) throw forbiddenError('cannotReviewSelf');
      const { request } = row;
      if (request.status === 'cancellationPending')
        await assertNoParentalReturn(tx, request.id);
      if (request.status === 'cancellationPending' && request.kind === 'leave')
        return this.reviewLeaveCancellation(tx, actor, request, dto);
      if (request.status !== 'pending')
        throw conflictError('requestAlreadyReviewed');
      if (dto.status === 'approved') {
        await this.assertRequestPayrollUnlocked(tx, request);
        if (request.kind === 'overtime')
          await this.approveOvertime(tx, actor, request, dto);
        if (request.kind === 'correction')
          await this.assertCorrectionFits(tx, request);
        if (request.kind === 'leave')
          await this.approveLeave(tx, actor, request, dto);
      }
      const [result] = await tx
        .update(attendanceRequest)
        .set({
          status: dto.status,
          reviewedBy: actor.userId,
          reviewedAt: new Date(),
          reviewReason: dto.reason,
        })
        .where(eq(attendanceRequest.id, id))
        .returning();
      await writeAudit(tx, actor, 'request.review', id, {
        status: dto.status,
        reason: dto.reason,
      });
      return result;
    });
  }

  private async reviewLeaveCancellation(
    tx: Transaction,
    actor: AttendanceActor,
    request: AttendanceRequestRow,
    dto: ReviewAttendanceRequestDto,
  ) {
    if (dto.status === 'approved') {
      await this.assertRequestPayrollUnlocked(tx, request);
      const [policy] = await tx
        .select()
        .from(attendanceLeaveType)
        .where(eq(attendanceLeaveType.id, request.leaveTypeId!));
      if (policy?.requiresBalance) {
        const balance = await leaveBalanceRow(
          tx,
          request.employeeId,
          policy.id,
          request.startsAt,
        );
        if (
          !balance ||
          request.leaveMinutes === null ||
          balance.usedMinutes < request.leaveMinutes
        )
          throw conflictError('insufficientLeaveBalance');
        await tx
          .update(attendanceLeaveBalance)
          .set({ usedMinutes: balance.usedMinutes - request.leaveMinutes })
          .where(eq(attendanceLeaveBalance.id, balance.id));
        await writeAudit(tx, actor, 'leave.restore', balance.id, {
          requestId: request.id,
          minutes: request.leaveMinutes,
        });
      }
    }
    const status =
      dto.status === 'approved'
        ? ('cancelled' as const)
        : ('approved' as const);
    const [result] = await tx
      .update(attendanceRequest)
      .set({
        status,
        reviewedBy: actor.userId,
        reviewedAt: new Date(),
        reviewReason: dto.reason,
      })
      .where(eq(attendanceRequest.id, request.id))
      .returning();
    await writeAudit(tx, actor, 'leave.cancelReview', request.id, {
      status,
      reason: dto.reason,
    });
    return result;
  }

  private async assertRequestPayrollUnlocked(
    tx: Transaction,
    request: AttendanceRequestRow,
  ) {
    if (request.kind === 'leave')
      return assertPayrollUnlocked(
        tx,
        request.organizationId,
        request.employeeId,
        request.startsAt,
      );
    const [shift] = await tx
      .select({
        startsAt: attendanceShift.startsAt,
        endsAt: attendanceShift.endsAt,
      })
      .from(attendanceShift)
      .where(eq(attendanceShift.id, request.shiftId!));
    await assertPayrollUnlocked(
      tx,
      request.organizationId,
      request.employeeId,
      new Date(Math.min(request.startsAt.getTime(), shift.startsAt.getTime())),
      new Date(Math.max(request.endsAt.getTime(), shift.endsAt.getTime())),
    );
  }

  private async overtimeSeconds(
    tx: Transaction,
    employeeId: string,
    scope: SQL,
  ) {
    const [{ seconds }] = await tx
      .select({
        seconds: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${attendanceRequest.endsAt} - ${attendanceRequest.startsAt}))), 0)::int`,
      })
      .from(attendanceRequest)
      .where(
        and(
          eq(attendanceRequest.employeeId, employeeId),
          eq(attendanceRequest.kind, 'overtime'),
          inArray(attendanceRequest.status, blockingRequestStatuses),
          scope,
        ),
      );
    return seconds;
  }

  private async assertOvertimeFits(
    tx: Transaction,
    shift: AttendanceShiftRow,
    interval: { endsAt: Date; startsAt: Date },
  ) {
    const workday = shift.dayKind === 'workday';
    if (
      workday
        ? interval.startsAt.getTime() !== shift.endsAt.getTime()
        : interval.startsAt < shift.startsAt || interval.endsAt > shift.endsAt
    )
      throw badRequestError('invalidInterval');
    const seconds =
      (interval.endsAt.getTime() - interval.startsAt.getTime()) / 1000;
    if (shift.dayKind !== 'regularLeave') {
      const sameShift = await this.overtimeSeconds(
        tx,
        shift.employeeId,
        eq(attendanceRequest.shiftId, shift.id),
      );
      if (
        (workday ? scheduledWorkSeconds(shift) : 0) + sameShift + seconds >
        MAX_DAILY_WORK_SECONDS
      )
        throw badRequestError('dailyHoursExceeded');
    }
    const platform = toPlatformTime(interval.startsAt);
    const year = platform.getUTCFullYear(),
      month = platform.getUTCMonth();
    const monthEnd = platformMonthStart(year, month + 1);
    const monthly = await this.overtimeSeconds(
      tx,
      shift.employeeId,
      startedBetween(platformMonthStart(year, month), monthEnd),
    );
    if (monthly + seconds > MAX_MONTHLY_OVERTIME_SECONDS)
      throw badRequestError('monthlyOvertimeExceeded');
  }

  private async approveOvertime(
    tx: Transaction,
    actor: AttendanceActor,
    request: AttendanceRequestRow,
    dto: ReviewAttendanceRequestDto,
  ) {
    const [shift] = await tx
      .select()
      .from(attendanceShift)
      .where(
        and(
          eq(attendanceShift.id, request.shiftId!),
          eq(attendanceShift.organizationId, actor.organizationId),
          eq(attendanceShift.employeeId, request.employeeId),
        ),
      );
    if (!shift) throw new NotFoundException();
    if (shift.dayKind !== 'regularLeave') {
      if (dto.emergency) throw badRequestError('invalidEmergencyDetails');
      return;
    }
    if (!dto.emergency) throw badRequestError('emergencyDetailsRequired');
    const makeup = parseInterval(
      dto.emergency.makeupStartsAt,
      dto.emergency.makeupEndsAt,
    );
    if (
      makeup.startsAt < shift.endsAt ||
      makeup.endsAt.getTime() - makeup.startsAt.getTime() < DAY_MS ||
      new Date(dto.emergency.reportedAt) > new Date()
    )
      throw badRequestError('invalidEmergencyDetails');
    const [conflict] = await tx
      .select()
      .from(attendanceShift)
      .where(
        and(
          eq(attendanceShift.employeeId, request.employeeId),
          ne(attendanceShift.status, 'cancelled'),
          lt(attendanceShift.startsAt, makeup.endsAt),
          sql`${attendanceShift.endsAt} > ${makeup.startsAt}`,
        ),
      );
    if (conflict) throw conflictError('overlappingShift');
    await tx
      .update(attendanceRequest)
      .set({ emergency: dto.emergency })
      .where(eq(attendanceRequest.id, request.id));
  }

  private async assertCorrectionFits(
    tx: Transaction,
    request: AttendanceRequestRow,
  ) {
    const proposed = request.correctedEvents!;
    const [changedEvent] = await tx
      .select({ id: attendanceEvent.id })
      .from(attendanceEvent)
      .where(
        and(
          eq(attendanceEvent.shiftId, request.shiftId!),
          sql`${attendanceEvent.receivedAt} > ${request.createdAt}`,
        ),
      )
      .limit(1);
    if (changedEvent) throw conflictError('correctionSourceChanged');
    const start = new Date(proposed[0].occurredAt),
      end = new Date(proposed.at(-1)!.occurredAt);
    const nearby = await tx
      .select({ id: attendanceShift.id })
      .from(attendanceShift)
      .where(
        and(
          eq(attendanceShift.employeeId, request.employeeId),
          ne(attendanceShift.id, request.shiftId!),
          or(
            sql`EXISTS (SELECT 1 FROM ${attendanceRequest} other
              WHERE other.shift_id = ${attendanceShift.id}
                AND other.kind = 'correction' AND other.status = 'approved'
                AND other.starts_at < ${end} AND other.ends_at > ${start})`,
            and(
              sql`EXISTS (SELECT 1 FROM ${attendanceEvent} opening
                WHERE opening.shift_id = ${attendanceShift.id}
                  AND opening.occurred_at < ${end})`,
              or(
                sql`EXISTS (SELECT 1 FROM ${attendanceEvent} later
                  WHERE later.shift_id = ${attendanceShift.id}
                    AND later.occurred_at > ${start})`,
                unfinishedShift,
              ),
            ),
          ),
        ),
      );
    const shiftIds = nearby.map((shift) => shift.id);
    const events = shiftIds.length
      ? await tx
          .select()
          .from(attendanceEvent)
          .where(inArray(attendanceEvent.shiftId, shiftIds))
          .orderBy(asc(attendanceEvent.occurredAt))
      : [];
    const corrections = shiftIds.length
      ? await tx
          .select()
          .from(attendanceRequest)
          .where(
            and(
              inArray(attendanceRequest.shiftId, shiftIds),
              eq(attendanceRequest.kind, 'correction'),
              eq(attendanceRequest.status, 'approved'),
            ),
          )
          .orderBy(desc(attendanceRequest.reviewedAt))
      : [];
    const eventsOf = new Map<string, typeof events>();
    for (const event of events) {
      const own = eventsOf.get(event.shiftId) ?? [];
      own.push(event);
      eventsOf.set(event.shiftId, own);
    }
    for (const shiftId of shiftIds) {
      const timeline =
        corrections.find((item) => item.shiftId === shiftId)?.correctedEvents ??
        (eventsOf.get(shiftId) ?? []).map((event) => ({
          action: event.action,
          occurredAt: event.occurredAt.toISOString(),
        }));
      if (!timeline.length) continue;
      const otherStart = new Date(timeline[0].occurredAt);
      const otherEnd =
        timeline.at(-1)!.action === 'clockOut'
          ? new Date(timeline.at(-1)!.occurredAt)
          : new Date();
      if (start < otherEnd && end > otherStart)
        throw conflictError('overlappingAttendance');
    }
  }

  private async requestedLeave(
    tx: Transaction,
    employee: typeof attendanceEmployee.$inferSelect,
    policy: typeof attendanceLeaveType.$inferSelect,
    leave: { id: string; startsAt: Date; endsAt: Date },
  ) {
    if (
      isMedicalLeave(policy.statutoryKind) &&
      leave.endsAt.getTime() - leave.startsAt.getTime() > MAX_MEDICAL_LEAVE_MS
    )
      throw badRequestError('medicalLeaveInterval');
    const medical = isMedicalLeave(policy.statutoryKind)
      ? await loadMedicalLedger(tx, employee, {
          ...leave,
          kind: policy.statutoryKind,
        })
      : null;
    const minutes = medical
      ? Math.ceil(
          medical.segments
            .filter((segment) => segment.requestId === leave.id)
            .reduce(
              (sum, segment) =>
                sum +
                (segment.units *
                  weeklyMinutesAt(employee, new Date(segment.start))) /
                  5,
              0,
            ),
        )
      : isCalendarLeave(policy.statutoryKind)
        ? calendarLeaveMinutes(leave.startsAt, leave.endsAt)
        : await leaveMinutes(tx, employee.id, leave.startsAt, leave.endsAt);
    if (!minutes) throw badRequestError('leaveOutsideShift');
    return { medical, minutes };
  }

  private async approveLeave(
    tx: Transaction,
    actor: AttendanceActor,
    request: AttendanceRequestRow,
    dto: ReviewAttendanceRequestDto,
  ) {
    const [policy] = await tx
      .select()
      .from(attendanceLeaveType)
      .where(eq(attendanceLeaveType.id, request.leaveTypeId!));
    if (!policy || !policy.enabled)
      throw badRequestError('leavePolicyRequired');
    const [employee] = await tx
      .select()
      .from(attendanceEmployee)
      .where(eq(attendanceEmployee.id, request.employeeId));
    const { medical, minutes } = await this.requestedLeave(
      tx,
      employee,
      policy,
      request,
    );
    const paidPercent = isEventLeave(policy.statutoryKind)
      ? await this.approveEventLeave(tx, actor, policy, request, minutes)
      : effectivePaidPercent(policy.statutoryKind, policy.paidPercent);
    await tx
      .update(attendanceRequest)
      .set({ leaveMinutes: minutes, paidPercent })
      .where(eq(attendanceRequest.id, request.id));
    if (medical) {
      this.assertMedicalQuota(policy, request, medical, dto);
      await writeAudit(tx, actor, 'leave.medicalReview', request.id, {
        medicalCertified: dto.medicalCertified ?? false,
      });
    } else if (
      policy.statutoryKind !== 'custom' &&
      !isEventLeave(policy.statutoryKind)
    )
      await this.assertStatutoryQuota(tx, employee, policy, request, minutes);
    if (policy.requiresBalance)
      await this.consumeLeaveBalance(tx, actor, policy, request, minutes);
  }

  private async approveEventLeave(
    tx: Transaction,
    actor: AttendanceActor,
    policy: typeof attendanceLeaveType.$inferSelect,
    request: AttendanceRequestRow,
    minutes: number,
  ) {
    const leaveCase = await matchLeaveCase(
      tx,
      actor.organizationId,
      request.employeeId,
      policy.id,
      request.leaveCaseId,
      request.startsAt,
      request.endsAt,
    );
    const usedMinutes = await leaveCaseUsage(tx, leaveCase.id);
    if (usedMinutes + minutes > leaveCase.grantedMinutes)
      throw conflictError('insufficientLeaveBalance');
    if (policy.statutoryKind === 'parental') {
      const cases = await tx
        .select()
        .from(attendanceLeaveCase)
        .where(
          and(
            eq(attendanceLeaveCase.organizationId, actor.organizationId),
            eq(attendanceLeaveCase.employeeId, request.employeeId),
            eq(attendanceLeaveCase.leaveTypeId, policy.id),
          ),
        );
      const records = await tx
        .select()
        .from(attendanceRequest)
        .where(
          and(
            eq(attendanceRequest.organizationId, actor.organizationId),
            eq(attendanceRequest.employeeId, request.employeeId),
            eq(attendanceRequest.leaveTypeId, policy.id),
            inArray(attendanceRequest.status, countedRequestStatuses),
          ),
        );
      if (cases.some((item) => !item.childId))
        throw conflictError('parentalChildUnassigned');
      const errors = parentalLeaveErrors(
        [...records, request].map((item) => ({
          ...item,
          leaveCaseId: item.leaveCaseId!,
        })),
        cases,
      );
      if (errors.length) throw conflictError(errors[0]);
    }
    return leaveCase.paidPercent;
  }

  private assertMedicalQuota(
    policy: typeof attendanceLeaveType.$inferSelect,
    request: AttendanceRequestRow,
    medical: Awaited<ReturnType<typeof loadMedicalLedger>>,
    dto: ReviewAttendanceRequestDto,
  ) {
    if (
      requiresMedicalCertificate(policy.statutoryKind) &&
      !dto.medicalCertified
    )
      throw badRequestError('medicalCertificateRequired');
    if (policy.statutoryKind === 'menstrual') {
      const day = platformDateString(request.startsAt);
      if (
        day !== platformDateString(new Date(request.endsAt.getTime() - 1)) ||
        medical.records.some(
          (item) =>
            item.kind === 'menstrual' &&
            platformDateString(item.startsAt).slice(0, 7) === day.slice(0, 7) &&
            platformDateString(item.startsAt) !== day,
        )
      )
        throw badRequestError('menstrualDayLimit');
      const units = medical.segments
        .filter(
          (segment) =>
            segment.kind === 'menstrual' &&
            platformDateString(new Date(segment.start)) === day,
        )
        .reduce((sum, segment) => sum + segment.units, 0);
      if (units > 1 + 1e-9) throw conflictError('insufficientLeaveBalance');
    } else {
      const affectedYears = new Set(
        medical.segments
          .filter((segment) => segment.requestId === request.id)
          .map((segment) => segment.year),
      );
      const sharedYears = new Set(
        [...affectedYears].flatMap((year) => [year, year + 1]),
      );
      for (const year of sharedYears) {
        const usage = medical.years.get(year);
        if (
          (policy.statutoryKind === 'sick' &&
            affectedYears.has(year) &&
            (usage?.ordinary ?? 0) > 30 + 1e-9) ||
          (usage?.shared ?? 0) + (medical.years.get(year - 1)?.shared ?? 0) >
            365 + 1e-9
        )
          throw conflictError('insufficientLeaveBalance');
      }
    }
  }

  private async assertStatutoryQuota(
    tx: Transaction,
    employee: typeof attendanceEmployee.$inferSelect,
    policy: typeof attendanceLeaveType.$inferSelect,
    request: AttendanceRequestRow,
    minutes: number,
  ) {
    const checked =
      policy.statutoryKind === 'familyCare'
        ? [policy, { ...policy, statutoryKind: 'personal' as const }]
        : [policy];
    const periods = checked.map((item) =>
      statutoryLeavePeriod(
        item.statutoryKind,
        employee.hiredAt,
        request.startsAt,
        weeklyMinutesOf(employee),
      ),
    );
    const preloaded = periods.every((period) => period)
      ? {
          policies: await tx
            .select()
            .from(attendanceLeaveType)
            .where(
              eq(attendanceLeaveType.organizationId, employee.organizationId),
            ),
          records: await countedLeaves(
            tx,
            employee.id,
            new Date(
              Math.min(...periods.map((period) => period!.start.getTime())),
            ),
            new Date(
              Math.max(...periods.map((period) => period!.end.getTime())),
            ),
          ),
        }
      : undefined;
    const balance = await statutoryBalance(
      tx,
      employee,
      policy,
      request.startsAt,
      preloaded,
    );
    if (
      !balance ||
      request.endsAt > balance.endsAt ||
      balance.usedMinutes + minutes > balance.grantedMinutes
    )
      throw conflictError('insufficientLeaveBalance');
    if (policy.statutoryKind === 'familyCare') {
      const shared = await statutoryBalance(
        tx,
        employee,
        checked[1],
        request.startsAt,
        preloaded,
      );
      if (!shared || shared.usedMinutes + minutes > shared.grantedMinutes)
        throw conflictError('insufficientLeaveBalance');
    }
  }

  private async consumeLeaveBalance(
    tx: Transaction,
    actor: AttendanceActor,
    policy: typeof attendanceLeaveType.$inferSelect,
    request: AttendanceRequestRow,
    minutes: number,
  ) {
    const balance = await leaveBalanceRow(
      tx,
      request.employeeId,
      policy.id,
      request.startsAt,
    );
    if (!balance || balance.grantedMinutes - balance.usedMinutes < minutes)
      throw conflictError('insufficientLeaveBalance');
    await tx
      .update(attendanceLeaveBalance)
      .set({ usedMinutes: balance.usedMinutes + minutes })
      .where(eq(attendanceLeaveBalance.id, balance.id));
    await writeAudit(tx, actor, 'leave.consume', balance.id, {
      requestId: request.id,
      minutes,
    });
  }

  async withdraw(actor: AttendanceActor, id: string) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const employee = await requireEmployee(actor, tx);
      const [row] = await tx
        .select()
        .from(attendanceRequest)
        .where(
          and(
            eq(attendanceRequest.id, id),
            eq(attendanceRequest.organizationId, actor.organizationId),
            eq(attendanceRequest.employeeId, employee.id),
          ),
        );
      if (!row) throw new NotFoundException();
      await assertNoParentalReturn(tx, row.id);
      if (
        row.status !== 'pending' &&
        !(row.kind === 'leave' && row.status === 'approved')
      )
        throw conflictError('requestAlreadyReviewed');
      const status =
        row.status === 'approved'
          ? ('cancellationPending' as const)
          : ('withdrawn' as const);
      await tx
        .update(attendanceRequest)
        .set({ status })
        .where(eq(attendanceRequest.id, id));
      await writeAudit(tx, actor, 'request.withdraw', id, { status });
      return { id };
    });
  }
}
