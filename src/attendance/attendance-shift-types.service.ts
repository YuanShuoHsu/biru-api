import { Inject, Injectable } from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  ne,
  type Column,
  type SQL,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { startDeletedRecordBatch } from '../deleted-records/request-batch.js';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
} from '../common/utils/data-grid-filters.js';
import { attendanceShiftType } from '../db/schema/attendance.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';

import type { AttendanceActor } from './attendance-actor.js';
import {
  lockOrganization,
  type Transaction,
  writeAudit,
  type RestoredRecord,
} from './attendance-audit.js';
import {
  badRequestError,
  conflictError,
  notFoundError,
} from './attendance-errors.js';
import {
  MAX_DAILY_WORK_SECONDS,
  scheduledWorkSeconds,
} from './attendance-rules.js';
import {
  ATTENDANCE_SHIFT_TYPE_FILTER_FIELDS,
  type AttendanceShiftTypePaginationQueryDto,
  type SaveAttendanceShiftTypeDto,
} from './dto/attendance-shift-type.dto.js';
import { scheduledBreaks } from './shift-intervals.js';

@Injectable()
export class AttendanceShiftTypesService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async shiftTypes(
    actor: AttendanceActor,
    query: AttendanceShiftTypePaginationQueryDto,
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
      name: attendanceShiftType.name,
      startTime: attendanceShiftType.startTime,
      endTime: attendanceShiftType.endTime,
    };
    const where = and(
      eq(attendanceShiftType.organizationId, actor.organizationId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            ATTENDANCE_SHIFT_TYPE_FILTER_FIELDS,
            [],
          )
        : undefined,
      buildQuickFilterCondition({
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(attendanceShiftType.name, `%${value}%`),
          ilike(attendanceShiftType.startTime, `%${value}%`),
          ilike(attendanceShiftType.endTime, `%${value}%`),
        ],
      }),
    );
    const sort = sortDirection === 'desc' ? desc : asc;
    const [data, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: attendanceShiftType.id,
          name: attendanceShiftType.name,
          startTime: attendanceShiftType.startTime,
          endTime: attendanceShiftType.endTime,
          createdAt: attendanceShiftType.createdAt,
        })
        .from(attendanceShiftType)
        .where(where)
        .orderBy(
          sort(fieldMap[sortBy ?? 'startTime']),
          asc(attendanceShiftType.id),
        )
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(attendanceShiftType).where(where),
    ]);
    return { data, total };
  }

  async createShiftType(
    actor: AttendanceActor,
    dto: SaveAttendanceShiftTypeDto,
    restored?: RestoredRecord,
  ) {
    return (restored?.tx ?? this.db).transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const values = await this.prepare(tx, actor.organizationId, dto);
      const id = restored?.id ?? randomUUID();
      await tx
        .insert(attendanceShiftType)
        .values({ id, organizationId: actor.organizationId, ...values });
      await writeAudit(
        tx,
        actor,
        restored ? 'shiftType.restore' : 'shiftType.create',
        id,
        values,
      );
      await restored?.finalize(tx);
      return { id };
    });
  }

  async updateShiftType(
    actor: AttendanceActor,
    id: string,
    dto: SaveAttendanceShiftTypeDto,
  ) {
    return this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      const { name, startTime, endTime } = await this.requireShiftType(
        tx,
        actor,
        id,
      );
      const values = await this.prepare(tx, actor.organizationId, dto, id);
      await tx
        .update(attendanceShiftType)
        .set(values)
        .where(eq(attendanceShiftType.id, id));
      await writeAudit(tx, actor, 'shiftType.update', id, {
        before: { name, startTime, endTime },
        after: values,
      });
      return { id };
    });
  }

  async deleteShiftType(actor: AttendanceActor, id: string) {
    await this.deleteShiftTypes(actor, [id]);
    return { id };
  }

  async deleteShiftTypes(actor: AttendanceActor, ids: string[]) {
    await this.db.transaction(async (tx) => {
      await lockOrganization(tx, actor.organizationId);
      for (const id of ids) {
        await startDeletedRecordBatch(tx);
        const { name, startTime, endTime } = await this.requireShiftType(
          tx,
          actor,
          id,
        );
        await tx
          .delete(attendanceShiftType)
          .where(eq(attendanceShiftType.id, id));
        await writeAudit(tx, actor, 'shiftType.delete', id, {
          name,
          startTime,
          endTime,
        });
      }
    });
  }

  private async requireShiftType(
    tx: Transaction,
    actor: AttendanceActor,
    id: string,
  ) {
    const [row] = await tx
      .select()
      .from(attendanceShiftType)
      .where(
        and(
          eq(attendanceShiftType.id, id),
          eq(attendanceShiftType.organizationId, actor.organizationId),
        ),
      );
    if (!row) throw notFoundError();
    return row;
  }

  private async prepare(
    tx: Transaction,
    organizationId: string,
    { name: rawName, startTime, endTime }: SaveAttendanceShiftTypeDto,
    exceptId?: string,
  ) {
    if (startTime === endTime) throw badRequestError('invalidInterval');
    const startsAt = new Date(`2000-01-01T${startTime}Z`);
    const endsAt = new Date(
      `2000-01-0${endTime > startTime ? 1 : 2}T${endTime}Z`,
    );
    if (
      scheduledWorkSeconds({
        startsAt,
        endsAt,
        breaks: scheduledBreaks({ startsAt, endsAt }),
        paidBreak: false,
      }) > MAX_DAILY_WORK_SECONDS
    )
      throw badRequestError('shiftTypeTooLong');
    const name = rawName.trim();
    const [taken] = await tx
      .select({ id: attendanceShiftType.id })
      .from(attendanceShiftType)
      .where(
        and(
          eq(attendanceShiftType.organizationId, organizationId),
          eq(attendanceShiftType.name, name),
          exceptId ? ne(attendanceShiftType.id, exceptId) : undefined,
        ),
      )
      .limit(1);
    if (taken) throw conflictError('shiftTypeNameTaken');
    return { name, startTime, endTime };
  }
}
