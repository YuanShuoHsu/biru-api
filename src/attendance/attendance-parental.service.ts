import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { platformMidnight } from '../common/constants/timezone.js';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from '../common/utils/data-grid-filters.js';
import {
  attendanceEmployee,
  attendanceLeaveCase,
  attendanceLeaveType,
  attendanceParentalChild,
  attendanceParentalReturn,
  attendanceRequest,
} from '../db/schema/attendance.js';
import { user } from '../db/schema/users.js';
import { startDeletedRecordBatch } from '../deleted-records/request-batch.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';

import type { AttendanceActor } from './attendance-actor.js';
import {
  assertPayrollUnlocked,
  auditChanges,
  lockOrganization,
  type RestoredRecord,
  type Transaction,
  writeAudit,
} from './attendance-audit.js';
import { badRequestError, conflictError } from './attendance-errors.js';
import { countedRequestStatuses } from './attendance-rules.js';
import {
  ATTENDANCE_REQUEST_REVIEWED_EVENT,
  ATTENDANCE_REQUEST_SUBMITTED_EVENT,
  type AttendanceRequestReviewedEvent,
  type AttendanceRequestSubmittedEvent,
} from './attendance-notification.events.js';
import { AssignAttendanceParentalChildDto } from './dto/assign-attendance-parental-child.dto.js';
import {
  ATTENDANCE_PARENTAL_CHILD_DATE_FILTER_FIELDS,
  ATTENDANCE_PARENTAL_CHILD_STRING_FILTER_FIELDS,
  AttendanceParentalChildPaginationQueryDto,
} from './dto/attendance-parental-child-pagination-query.dto.js';
import {
  ATTENDANCE_PARENTAL_RETURN_DATE_FILTER_FIELDS,
  ATTENDANCE_PARENTAL_RETURN_ENUM_FILTER_FIELDS,
  ATTENDANCE_PARENTAL_RETURN_STRING_FILTER_FIELDS,
  AttendanceParentalReturnPaginationQueryDto,
} from './dto/attendance-parental-return-pagination-query.dto.js';
import { CreateAttendanceParentalChildDto } from './dto/create-attendance-parental-child.dto.js';
import { CreateAttendanceParentalReturnDto } from './dto/create-attendance-parental-return.dto.js';
import { UpdateAttendanceParentalChildDto } from './dto/update-attendance-parental-child.dto.js';
import {
  ReviewAttendanceRequestDto,
  reviewReasonOf,
} from './dto/review-attendance-request.dto.js';
import { requireEmployee } from './employee-lookup.js';
import { anniversary, calendarLeaveMinutes } from './leave-rules.js';
import { parentalLeaveErrors } from './parental-leave.js';
import {
  assertNoParentalReturn,
  matchParentalChild,
} from './parental-ledger.js';
import { assertIndependentReview } from './review-separation.js';

@Injectable()
export class AttendanceParentalService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private readonly events: EventEmitter2,
  ) {}

  async parentalChildren(
    actor: AttendanceActor,
    query: AttendanceParentalChildPaginationQueryDto,
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
      sortDirection = 'asc',
    } = query;
    const employee = mine ? await requireEmployee(actor, this.db) : null;
    const fieldMap: Record<string, Column | SQL> = {
      employeeName: user.name,
      employeeEmail: user.email,
      reference: attendanceParentalChild.reference,
      label: attendanceParentalChild.label,
      birthDate: attendanceParentalChild.birthDate,
    };
    const where = and(
      eq(attendanceParentalChild.organizationId, actor.organizationId),
      employee
        ? eq(attendanceParentalChild.employeeId, employee.id)
        : undefined,
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            ATTENDANCE_PARENTAL_CHILD_STRING_FILTER_FIELDS,
            ATTENDANCE_PARENTAL_CHILD_DATE_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(user.name, `%${value}%`),
          ilike(user.email, `%${value}%`),
          ilike(attendanceParentalChild.reference, `%${value}%`),
          ilike(attendanceParentalChild.label, `%${value}%`),
          ilike(localTimeText(attendanceParentalChild.birthDate), `%${value}%`),
        ],
      }),
    );
    const sort = sortDirection === 'desc' ? desc : asc;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          child: attendanceParentalChild,
          employeeName: user.name,
          employeeEmail: user.email,
          deletable: sql<boolean>`NOT EXISTS (
            SELECT 1 FROM attendance_leave_case WHERE child_id = ${attendanceParentalChild.id}
          )`,
        })
        .from(attendanceParentalChild)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceParentalChild.employeeId),
        )
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(where)
        .orderBy(
          sort(sortBy ? fieldMap[sortBy] : attendanceParentalChild.createdAt),
          asc(attendanceParentalChild.id),
        )
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(attendanceParentalChild)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceParentalChild.employeeId),
        )
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(where),
    ]);
    return {
      data: rows.map(({ child, deletable, employeeEmail, employeeName }) => ({
        ...child,
        deletable,
        employeeEmail,
        employeeName,
      })),
      total,
    };
  }

  async createParentalChild(
    actor: AttendanceActor,
    dto: CreateAttendanceParentalChildDto,
    restored?: RestoredRecord,
  ) {
    return (restored?.tx ?? this.db).transaction(async (tx) => {
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
      await assertIndependentReview(tx, actor, 'parentalChild', [
        employee.userId,
      ]);
      const { birthDate, label, reference } = await this.prepareParentalChild(
        tx,
        actor,
        employee.id,
        dto,
      );
      const [row] = await tx
        .insert(attendanceParentalChild)
        .values({
          id: restored?.id ?? randomUUID(),
          organizationId: actor.organizationId,
          employeeId: employee.id,
          reference,
          label,
          birthDate,
        })
        .returning();
      await writeAudit(
        tx,
        actor,
        restored ? 'parentalChild.restore' : 'parentalChild.create',
        row.id,
        { employeeId: employee.id, reference: row.reference },
      );
      await restored?.finalize(tx);
      return row;
    });
  }

  async updateParentalChild(
    actor: AttendanceActor,
    id: string,
    dto: UpdateAttendanceParentalChildDto,
  ) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const before = await this.requireParentalChild(tx, actor, id);
      const values = await this.prepareParentalChild(
        tx,
        actor,
        before.employeeId,
        dto,
        id,
      );
      if (values.birthDate.getTime() !== before.birthDate.getTime()) {
        const cases = await tx
          .select()
          .from(attendanceLeaveCase)
          .where(
            and(
              eq(attendanceLeaveCase.organizationId, actor.organizationId),
              eq(attendanceLeaveCase.employeeId, before.employeeId),
            ),
          );
        const updatedCases = cases.map((item) =>
          item.childId === id ? { ...item, eventDate: values.birthDate } : item,
        );
        if (
          updatedCases.some(
            (item) =>
              item.childId === id &&
              (item.startsAt < values.birthDate ||
                item.endsAt > anniversary(values.birthDate, 36)),
          )
        )
          throw badRequestError('invalidParentalInterval');
        const parentalCases = updatedCases.filter((item) => item.childId);
        const records = parentalCases.length
          ? await tx
              .select()
              .from(attendanceRequest)
              .where(
                and(
                  inArray(
                    attendanceRequest.leaveCaseId,
                    parentalCases.map((item) => item.id),
                  ),
                  inArray(attendanceRequest.status, countedRequestStatuses),
                ),
              )
          : [];
        const errors = parentalLeaveErrors(
          records.map((record) => ({
            ...record,
            leaveCaseId: record.leaveCaseId!,
          })),
          parentalCases,
        );
        if (errors.length) throw conflictError(errors[0]);
        await tx
          .update(attendanceLeaveCase)
          .set({ eventDate: values.birthDate })
          .where(eq(attendanceLeaveCase.childId, id));
      }
      const [row] = await tx
        .update(attendanceParentalChild)
        .set(values)
        .where(eq(attendanceParentalChild.id, id))
        .returning();
      await writeAudit(
        tx,
        actor,
        'parentalChild.update',
        id,
        auditChanges(before, row),
      );
      return row;
    });
  }

  private async prepareParentalChild(
    tx: Transaction,
    actor: AttendanceActor,
    employeeId: string,
    dto: UpdateAttendanceParentalChildDto,
    exceptId?: string,
  ) {
    const birthDate = new Date(dto.birthDate);
    const reference = dto.reference.trim();
    const label = dto.label.trim();
    if (
      !reference ||
      !label ||
      !Number.isFinite(birthDate.getTime()) ||
      birthDate > new Date() ||
      birthDate.getTime() !== platformMidnight(birthDate.getTime())
    )
      throw badRequestError('parentalChildMismatch');
    const [existing] = await tx
      .select({ id: attendanceParentalChild.id })
      .from(attendanceParentalChild)
      .where(
        and(
          eq(attendanceParentalChild.organizationId, actor.organizationId),
          eq(attendanceParentalChild.employeeId, employeeId),
          eq(attendanceParentalChild.reference, reference),
          exceptId ? ne(attendanceParentalChild.id, exceptId) : undefined,
        ),
      );
    if (existing) throw conflictError('parentalChildExists');
    return { birthDate, label, reference };
  }

  async deleteParentalChild(actor: AttendanceActor, id: string) {
    await this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      await startDeletedRecordBatch(tx);
      const child = await this.requireParentalChild(tx, actor, id);
      const [referenced] = await tx
        .select({ id: attendanceLeaveCase.id })
        .from(attendanceLeaveCase)
        .where(eq(attendanceLeaveCase.childId, id))
        .limit(1);
      if (referenced) throw conflictError('parentalChildInUse');
      await tx
        .delete(attendanceParentalChild)
        .where(eq(attendanceParentalChild.id, id));
      await writeAudit(tx, actor, 'parentalChild.delete', id, {
        employeeId: child.employeeId,
        reference: child.reference,
        label: child.label,
        birthDate: child.birthDate,
      });
    });
    return { id };
  }

  private async requireParentalChild(
    tx: Transaction,
    actor: AttendanceActor,
    id: string,
  ) {
    const [row] = await tx
      .select({
        child: attendanceParentalChild,
        userId: attendanceEmployee.userId,
      })
      .from(attendanceParentalChild)
      .innerJoin(
        attendanceEmployee,
        eq(attendanceEmployee.id, attendanceParentalChild.employeeId),
      )
      .where(
        and(
          eq(attendanceParentalChild.id, id),
          eq(attendanceParentalChild.organizationId, actor.organizationId),
        ),
      );
    if (!row) throw new NotFoundException();
    await assertIndependentReview(tx, actor, 'parentalChild', [row.userId]);
    return row.child;
  }

  async assignParentalChild(
    actor: AttendanceActor,
    id: string,
    dto: AssignAttendanceParentalChildDto,
  ) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [row] = await tx
        .select({
          leaveCase: attendanceLeaveCase,
          employee: attendanceEmployee,
          policy: attendanceLeaveType,
        })
        .from(attendanceLeaveCase)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceLeaveCase.employeeId),
        )
        .innerJoin(
          attendanceLeaveType,
          eq(attendanceLeaveType.id, attendanceLeaveCase.leaveTypeId),
        )
        .where(
          and(
            eq(attendanceLeaveCase.id, id),
            eq(attendanceLeaveCase.organizationId, actor.organizationId),
          ),
        );
      if (!row) throw new NotFoundException();
      await assertIndependentReview(tx, actor, 'leaveCase', [
        row.employee.userId,
      ]);
      if (
        !dto.reason.trim() ||
        row.policy.statutoryKind !== 'parental' ||
        (row.leaveCase.childId && row.leaveCase.childId !== dto.childId)
      )
        throw badRequestError('parentalChildMismatch');
      await matchParentalChild(
        tx,
        actor.organizationId,
        row.employee.id,
        dto.childId,
        row.leaveCase.eventDate,
      );
      const [result] = await tx
        .update(attendanceLeaveCase)
        .set({ childId: dto.childId })
        .where(eq(attendanceLeaveCase.id, id))
        .returning();
      await writeAudit(tx, actor, 'parentalChild.assign', id, {
        childId: dto.childId,
        reason: dto.reason.trim(),
      });
      return result;
    });
  }

  async parentalReturns(
    actor: AttendanceActor,
    query: AttendanceParentalReturnPaginationQueryDto,
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
    const employee = mine ? await requireEmployee(actor, this.db) : null;
    const fieldMap: Record<string, Column | SQL> = {
      employeeName: user.name,
      employeeEmail: user.email,
      reason: attendanceParentalReturn.reason,
      reviewReason: attendanceParentalReturn.reviewReason,
      returnsAt: attendanceParentalReturn.returnsAt,
      originalStartsAt: attendanceParentalReturn.originalStartsAt,
      originalEndsAt: attendanceParentalReturn.originalEndsAt,
      status: attendanceParentalReturn.status,
    };
    const where = and(
      eq(attendanceParentalReturn.organizationId, actor.organizationId),
      employee
        ? eq(attendanceParentalReturn.employeeId, employee.id)
        : undefined,
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            ATTENDANCE_PARENTAL_RETURN_STRING_FILTER_FIELDS,
            ATTENDANCE_PARENTAL_RETURN_DATE_FILTER_FIELDS,
            ATTENDANCE_PARENTAL_RETURN_ENUM_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: ATTENDANCE_PARENTAL_RETURN_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(user.name, `%${value}%`),
          ilike(user.email, `%${value}%`),
          ilike(attendanceParentalReturn.reason, `%${value}%`),
          ilike(attendanceParentalReturn.reviewReason, `%${value}%`),
          ilike(
            localTimeText(attendanceParentalReturn.returnsAt),
            `%${value}%`,
          ),
        ],
      }),
    );
    const sort = sortDirection === 'asc' ? asc : desc;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          item: attendanceParentalReturn,
          employeeName: user.name,
          employeeEmail: user.email,
        })
        .from(attendanceParentalReturn)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceParentalReturn.employeeId),
        )
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(where)
        .orderBy(
          sort(sortBy ? fieldMap[sortBy] : attendanceParentalReturn.createdAt),
          asc(attendanceParentalReturn.id),
        )
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(attendanceParentalReturn)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceParentalReturn.employeeId),
        )
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(where),
    ]);
    return {
      data: rows.map(({ item, employeeEmail, employeeName }) => ({
        ...item,
        employeeEmail,
        employeeName,
      })),
      total,
    };
  }

  async createParentalReturn(
    actor: AttendanceActor,
    requestId: string,
    dto: CreateAttendanceParentalReturnDto,
  ) {
    const result = await this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const employee = await requireEmployee(actor, tx);
      const [row] = await tx
        .select({
          request: attendanceRequest,
          kind: attendanceLeaveType.statutoryKind,
        })
        .from(attendanceRequest)
        .innerJoin(
          attendanceLeaveType,
          eq(attendanceLeaveType.id, attendanceRequest.leaveTypeId),
        )
        .where(
          and(
            eq(attendanceRequest.id, requestId),
            eq(attendanceRequest.organizationId, actor.organizationId),
            eq(attendanceRequest.employeeId, employee.id),
          ),
        );
      if (!row) throw new NotFoundException();
      const returnsAt = new Date(dto.returnsAt),
        request = row.request;
      if (
        row.kind !== 'parental' ||
        request.status !== 'approved' ||
        !dto.reason.trim() ||
        !calendarLeaveMinutes(request.startsAt, returnsAt) ||
        returnsAt >= request.endsAt
      )
        throw badRequestError('parentalReturnInvalid');
      await assertNoParentalReturn(tx, requestId);
      await assertPayrollUnlocked(
        tx,
        actor.organizationId,
        employee.id,
        returnsAt,
        request.endsAt,
      );
      const [result] = await tx
        .insert(attendanceParentalReturn)
        .values({
          id: randomUUID(),
          organizationId: actor.organizationId,
          employeeId: employee.id,
          requestId,
          originalStartsAt: request.startsAt,
          originalEndsAt: request.endsAt,
          returnsAt,
          reason: dto.reason.trim(),
        })
        .returning();
      await writeAudit(tx, actor, 'parentalReturn.create', result.id, {
        requestId,
        returnsAt: dto.returnsAt,
        reason: result.reason,
      });
      return result;
    });
    this.events.emit(ATTENDANCE_REQUEST_SUBMITTED_EVENT, {
      organizationId: result.organizationId,
      employeeId: result.employeeId,
      kind: 'parentalReturn',
      startsAt: result.returnsAt,
      endsAt: result.originalEndsAt,
    } satisfies AttendanceRequestSubmittedEvent);
    return result;
  }

  async reviewParentalReturn(
    actor: AttendanceActor,
    id: string,
    dto: ReviewAttendanceRequestDto,
  ) {
    const result = await this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [row] = await tx
        .select({
          change: attendanceParentalReturn,
          request: attendanceRequest,
          userId: attendanceEmployee.userId,
        })
        .from(attendanceParentalReturn)
        .innerJoin(
          attendanceRequest,
          eq(attendanceRequest.id, attendanceParentalReturn.requestId),
        )
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceParentalReturn.employeeId),
        )
        .where(
          and(
            eq(attendanceParentalReturn.id, id),
            eq(attendanceParentalReturn.organizationId, actor.organizationId),
          ),
        );
      if (!row) throw new NotFoundException();
      await assertIndependentReview(tx, actor, 'parentalReturn', [row.userId]);
      if (row.change.status !== 'pending')
        throw conflictError('requestAlreadyReviewed');
      const reason = reviewReasonOf(dto);
      if (dto.status === 'approved') {
        if (
          row.request.status !== 'approved' ||
          row.request.endsAt.getTime() !== row.change.originalEndsAt.getTime()
        )
          throw conflictError('parentalReturnStale');
        await assertPayrollUnlocked(
          tx,
          actor.organizationId,
          row.change.employeeId,
          row.change.returnsAt,
          row.change.originalEndsAt,
        );
        await tx
          .update(attendanceRequest)
          .set({
            endsAt: row.change.returnsAt,
            originalEndsAt: row.request.originalEndsAt ?? row.request.endsAt,
            leaveMinutes: calendarLeaveMinutes(
              row.request.startsAt,
              row.change.returnsAt,
            ),
          })
          .where(eq(attendanceRequest.id, row.request.id));
      }
      const [result] = await tx
        .update(attendanceParentalReturn)
        .set({
          status: dto.status,
          reviewedBy: actor.userId,
          reviewedAt: new Date(),
          reviewReason: reason || null,
        })
        .where(eq(attendanceParentalReturn.id, id))
        .returning();
      await writeAudit(tx, actor, 'parentalReturn.review', id, {
        status: dto.status,
        reason,
        requestId: row.request.id,
        originalEndsAt: row.change.originalEndsAt.toISOString(),
        returnsAt: row.change.returnsAt.toISOString(),
      });
      return result;
    });
    this.events.emit(ATTENDANCE_REQUEST_REVIEWED_EVENT, {
      organizationId: result.organizationId,
      employeeId: result.employeeId,
      kind: 'parentalReturn',
      startsAt: result.returnsAt,
      endsAt: result.originalEndsAt,
      reviewerUserId: actor.userId,
      status: dto.status,
      reason: result.reviewReason ?? '',
    } satisfies AttendanceRequestReviewedEvent);
    return result;
  }

  async withdrawParentalReturn(actor: AttendanceActor, id: string) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const employee = await requireEmployee(actor, tx);
      const [row] = await tx
        .select()
        .from(attendanceParentalReturn)
        .where(
          and(
            eq(attendanceParentalReturn.id, id),
            eq(attendanceParentalReturn.organizationId, actor.organizationId),
            eq(attendanceParentalReturn.employeeId, employee.id),
          ),
        );
      if (!row) throw new NotFoundException();
      if (row.status !== 'pending')
        throw conflictError('requestAlreadyReviewed');
      const [result] = await tx
        .update(attendanceParentalReturn)
        .set({ status: 'withdrawn' })
        .where(eq(attendanceParentalReturn.id, id))
        .returning();
      await writeAudit(tx, actor, 'parentalReturn.withdraw', id, {
        requestId: row.requestId,
      });
      return result;
    });
  }
}
