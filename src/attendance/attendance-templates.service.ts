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

import { DAY_MS } from 'src/common/constants/timezone';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
} from 'src/common/utils/data-grid-filters';
import {
  attendanceEmployee,
  attendanceTemplate,
} from 'src/db/schema/attendance';
import { user } from 'src/db/schema/users';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';

import type { AttendanceActor } from './attendance-actor';
import { lockOrganization, writeAudit } from './attendance-audit';
import { badRequestError } from './attendance-errors';
import { MAX_SHIFT_MS } from './attendance-rules';
import { AttendanceShiftsService } from './attendance-shifts.service';
import {
  ATTENDANCE_TEMPLATE_BOOLEAN_FILTER_FIELDS,
  ATTENDANCE_TEMPLATE_ENUM_FILTER_FIELDS,
  ATTENDANCE_TEMPLATE_NUMBER_FILTER_FIELDS,
  ATTENDANCE_TEMPLATE_STRING_FILTER_FIELDS,
  AttendanceTemplatePaginationQueryDto,
} from './dto/attendance-template-pagination-query.dto';
import { CreateAttendanceShiftDto } from './dto/create-attendance-shifts.dto';
import { GenerateAttendanceTemplateDto } from './dto/generate-attendance-template.dto';
import { SaveAttendanceTemplateDto } from './dto/save-attendance-template.dto';
import {
  parseBreakWindow,
  parseInterval,
  templateShift,
} from './shift-intervals';

@Injectable()
export class AttendanceTemplatesService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private readonly attendanceShiftsService: AttendanceShiftsService,
  ) {}

  async templates(
    actor: AttendanceActor,
    query: AttendanceTemplatePaginationQueryDto,
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
    const fieldMap: Record<string, Column | SQL> = {
      name: attendanceTemplate.name,
      employeeName: user.name,
      startTime: attendanceTemplate.startTime,
      endTime: attendanceTemplate.endTime,
      dayKind: attendanceTemplate.dayKind,
      weekday: attendanceTemplate.weekday,
      nextDay: attendanceTemplate.nextDay,
      paidBreak: attendanceTemplate.paidBreak,
    };
    const where = and(
      eq(attendanceTemplate.organizationId, actor.organizationId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            ATTENDANCE_TEMPLATE_STRING_FILTER_FIELDS,
            [],
            ATTENDANCE_TEMPLATE_ENUM_FILTER_FIELDS,
            ATTENDANCE_TEMPLATE_NUMBER_FILTER_FIELDS,
            [],
            [],
            ATTENDANCE_TEMPLATE_BOOLEAN_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: ATTENDANCE_TEMPLATE_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(attendanceTemplate.name, `%${value}%`),
          ilike(user.name, `%${value}%`),
          ilike(attendanceTemplate.startTime, `%${value}%`),
          ilike(attendanceTemplate.endTime, `%${value}%`),
        ],
      }),
    );
    const sort = sortDirection === 'desc' ? desc : asc;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          template: attendanceTemplate,
          employeeName: user.name,
        })
        .from(attendanceTemplate)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceTemplate.employeeId),
        )
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(where)
        .orderBy(
          sort(sortBy ? fieldMap[sortBy] : attendanceTemplate.name),
          asc(attendanceTemplate.id),
        )
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(attendanceTemplate)
        .innerJoin(
          attendanceEmployee,
          eq(attendanceEmployee.id, attendanceTemplate.employeeId),
        )
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(where),
    ]);
    return {
      data: rows.map(({ template, employeeName }) => ({
        ...template,
        employeeName,
      })),
      total,
    };
  }

  async saveTemplate(
    actor: AttendanceActor,
    dto: SaveAttendanceTemplateDto,
    id?: string,
  ) {
    const shift = templateShift('2026-01-01', dto);
    const interval = parseInterval(shift.startsAt, shift.endsAt);
    if (interval.endsAt.getTime() - interval.startsAt.getTime() > MAX_SHIFT_MS)
      throw badRequestError('invalidInterval');
    parseBreakWindow(interval, shift.breakStartsAt, shift.breakEndsAt);
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
      const { breakStartTime = null, breakEndTime = null, ...rest } = dto;
      const values = { ...rest, breakStartTime, breakEndTime };
      const [row] = id
        ? await tx
            .update(attendanceTemplate)
            .set(values)
            .where(
              and(
                eq(attendanceTemplate.id, id),
                eq(attendanceTemplate.organizationId, actor.organizationId),
              ),
            )
            .returning()
        : await tx
            .insert(attendanceTemplate)
            .values({
              id: randomUUID(),
              organizationId: actor.organizationId,
              ...values,
            })
            .returning();
      if (!row) throw new NotFoundException();
      await writeAudit(
        tx,
        actor,
        id ? 'template.update' : 'template.create',
        row.id,
        { ...dto },
      );
      return row;
    });
  }

  async deleteTemplate(actor: AttendanceActor, id: string) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const [row] = await tx
        .delete(attendanceTemplate)
        .where(
          and(
            eq(attendanceTemplate.id, id),
            eq(attendanceTemplate.organizationId, actor.organizationId),
          ),
        )
        .returning({ id: attendanceTemplate.id });
      if (!row) throw new NotFoundException();
      await writeAudit(tx, actor, 'template.delete', id, {});
      return row;
    });
  }

  async generateTemplate(
    actor: AttendanceActor,
    id: string,
    dto: GenerateAttendanceTemplateDto,
  ) {
    const [template] = await this.db
      .select()
      .from(attendanceTemplate)
      .where(
        and(
          eq(attendanceTemplate.id, id),
          eq(attendanceTemplate.organizationId, actor.organizationId),
        ),
      );
    if (!template) throw new NotFoundException();
    const start = new Date(`${dto.from}T00:00:00Z`),
      end = new Date(`${dto.to}T00:00:00Z`);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end < start ||
      end.getTime() - start.getTime() > 90 * DAY_MS
    )
      throw badRequestError('invalidInterval');
    const shifts: CreateAttendanceShiftDto[] = [];
    for (
      let cursor = start.getTime();
      cursor <= end.getTime();
      cursor += DAY_MS
    ) {
      const day = new Date(cursor);
      if (day.getUTCDay() !== template.weekday) continue;
      shifts.push({
        employeeId: template.employeeId,
        ...templateShift(day.toISOString().slice(0, 10), template),
        paidBreak: template.paidBreak,
        dayKind: template.dayKind,
      });
    }
    if (!shifts.length) throw badRequestError('noTemplateDates');
    return this.attendanceShiftsService.createShifts(actor, shifts);
  }
}
