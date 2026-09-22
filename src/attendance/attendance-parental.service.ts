import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  type Column,
  type SQL,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { platformMidnight } from 'src/common/constants/timezone';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from 'src/common/utils/data-grid-filters';
import {
  attendanceEmployee,
  attendanceLeaveCase,
  attendanceLeaveType,
  attendanceParentalChild,
  attendanceParentalReturn,
  attendanceRequest,
} from 'src/db/schema/attendance';
import { user } from 'src/db/schema/users';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import type { AttendanceActor } from './attendance-actor';
import {
  assertPayrollUnlocked,
  lockOrganization,
  writeAudit,
} from './attendance-audit';
import {
  badRequestError,
  conflictError,
  forbiddenError,
} from './attendance-errors';
import { AssignAttendanceParentalChildDto } from './dto/assign-attendance-parental-child.dto';
import {
  ATTENDANCE_PARENTAL_CHILD_DATE_FILTER_FIELDS,
  ATTENDANCE_PARENTAL_CHILD_STRING_FILTER_FIELDS,
  AttendanceParentalChildPaginationQueryDto,
} from './dto/attendance-parental-child-pagination-query.dto';
import {
  ATTENDANCE_PARENTAL_RETURN_DATE_FILTER_FIELDS,
  ATTENDANCE_PARENTAL_RETURN_ENUM_FILTER_FIELDS,
  ATTENDANCE_PARENTAL_RETURN_STRING_FILTER_FIELDS,
  AttendanceParentalReturnPaginationQueryDto,
} from './dto/attendance-parental-return-pagination-query.dto';
import { CreateAttendanceParentalChildDto } from './dto/create-attendance-parental-child.dto';
import { CreateAttendanceParentalReturnDto } from './dto/create-attendance-parental-return.dto';
import { ReviewAttendanceRequestDto } from './dto/review-attendance-request.dto';
import { requireEmployee } from './employee-lookup';
import { calendarLeaveMinutes } from './leave-rules';
import { assertNoParentalReturn, matchParentalChild } from './parental-ledger';

@Injectable()
export class AttendanceParentalService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

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
      data: rows.map(({ child, employeeName }) => ({ ...child, employeeName })),
      total,
    };
  }

  async createParentalChild(
    actor: AttendanceActor,
    dto: CreateAttendanceParentalChildDto,
  ) {
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
      if (employee.userId === actor.userId)
        throw forbiddenError('cannotReviewSelf');
      const birthDate = new Date(dto.birthDate);
      if (
        !dto.reference.trim() ||
        !dto.label.trim() ||
        !Number.isFinite(birthDate.getTime()) ||
        birthDate > new Date() ||
        birthDate.getTime() !== platformMidnight(birthDate.getTime())
      )
        throw badRequestError('parentalChildMismatch');
      const [existing] = await tx
        .select()
        .from(attendanceParentalChild)
        .where(
          and(
            eq(attendanceParentalChild.organizationId, actor.organizationId),
            eq(attendanceParentalChild.employeeId, employee.id),
            eq(attendanceParentalChild.reference, dto.reference.trim()),
          ),
        );
      if (existing) throw conflictError('parentalChildExists');
      const [row] = await tx
        .insert(attendanceParentalChild)
        .values({
          id: randomUUID(),
          organizationId: actor.organizationId,
          employeeId: employee.id,
          reference: dto.reference.trim(),
          label: dto.label.trim(),
          birthDate,
        })
        .returning();
      await writeAudit(tx, actor, 'parentalChild.create', row.id, {
        employeeId: employee.id,
        reference: row.reference,
      });
      return row;
    });
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
      if (row.employee.userId === actor.userId)
        throw forbiddenError('cannotReviewSelf');
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
      data: rows.map(({ item, employeeName }) => ({ ...item, employeeName })),
      total,
    };
  }

  async createParentalReturn(
    actor: AttendanceActor,
    requestId: string,
    dto: CreateAttendanceParentalReturnDto,
  ) {
    return this.db.transaction(async (tx) => {
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
  }

  async reviewParentalReturn(
    actor: AttendanceActor,
    id: string,
    dto: ReviewAttendanceRequestDto,
  ) {
    return this.db.transaction(async (tx) => {
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
      if (row.userId === actor.userId) throw forbiddenError('cannotReviewSelf');
      if (row.change.status !== 'pending')
        throw conflictError('requestAlreadyReviewed');
      if (!dto.reason?.trim()) throw badRequestError('parentalReturnInvalid');
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
          reviewReason: dto.reason.trim(),
        })
        .where(eq(attendanceParentalReturn.id, id))
        .returning();
      await writeAudit(tx, actor, 'parentalReturn.review', id, {
        status: dto.status,
        reason: dto.reason.trim(),
        requestId: row.request.id,
        originalEndsAt: row.change.originalEndsAt.toISOString(),
        returnsAt: row.change.returnsAt.toISOString(),
      });
      return result;
    });
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
