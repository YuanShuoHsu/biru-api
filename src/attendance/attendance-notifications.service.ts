import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { and, eq, gt, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
  attendanceAnnualLeaveNotice,
  attendanceEmployee,
  attendanceRequest,
  attendanceShift,
} from '../db/schema/attendance.js';
import { organization } from '../db/schema/organizations.js';
import { user } from '../db/schema/users.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import { MailsService } from '../mails/mails.service.js';

import {
  ATTENDANCE_REQUEST_REVIEWED_EVENT,
  ATTENDANCE_REQUEST_SUBMITTED_EVENT,
  type AttendanceRequestReviewedEvent,
  type AttendanceRequestSubmittedEvent,
} from './attendance-notification.events.js';
import { MAX_DAILY_WORK_SECONDS, punchLeewayMs } from './attendance-rules.js';
import { AttendanceShiftsService } from './attendance-shifts.service.js';
import { loadEmployeeHours, weeklyMinutesOf } from './employee-hours.js';
import { anniversary, annualLeaveLedger } from './leave-rules.js';
import { reviewerUserIds } from './review-separation.js';
import { unfinishedShift } from './shift-queries.js';

const REVIEW_PAGES = {
  parentalReturn: '/attendance/leave/parental-returns',
  default: '/attendance/schedule/reviews',
} as const;

const MY_REQUESTS_PAGE = '/attendance/mine/requests';

const MY_LEAVE_PAGE = '/attendance/mine/leave';

const MY_SHIFTS_PAGE = '/attendance/mine/shifts';

// 勞基法施行細則 §24 III：取得特休權利之日起 30 日內告知
const ENTITLEMENT_NOTICE_DAYS = 30;

@Injectable()
export class AttendanceNotificationsService {
  private readonly logger = new Logger(AttendanceNotificationsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly mails: MailsService,
    private readonly shiftsService: AttendanceShiftsService,
  ) {}

  private async context(organizationId: string, employeeId: string) {
    const [[store], [employee]] = await Promise.all([
      this.db
        .select({ name: organization.name, slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, organizationId)),
      this.db
        .select({
          userId: user.id,
          email: user.email,
          lang: user.lang,
          name: user.name,
        })
        .from(attendanceEmployee)
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .where(
          and(
            eq(attendanceEmployee.id, employeeId),
            eq(attendanceEmployee.organizationId, organizationId),
          ),
        ),
    ]);
    return store && employee ? { store, employee } : null;
  }

  @OnEvent(ATTENDANCE_REQUEST_SUBMITTED_EVENT, { async: true })
  async onSubmitted(event: AttendanceRequestSubmittedEvent) {
    try {
      const context = await this.context(
        event.organizationId,
        event.employeeId,
      );
      if (!context) return;
      const userIds = (
        await reviewerUserIds(
          this.db,
          event.organizationId,
          event.kind === 'parentalReturn'
            ? 'parentalReturn'
            : 'attendanceRequest',
        )
      ).filter((userId) => userId !== context.employee.userId);
      if (!userIds.length) return;
      const reviewers = await this.db
        .select({ email: user.email, lang: user.lang, name: user.name })
        .from(user)
        .where(inArray(user.id, userIds));
      await Promise.all(
        reviewers.map((reviewer) =>
          this.mails.sendAttendanceNotification({
            recipient: reviewer,
            direction: 'submitted',
            kind: event.kind,
            employeeName: context.employee.name,
            organizationName: context.store.name,
            path: `${
              event.kind === 'parentalReturn'
                ? REVIEW_PAGES.parentalReturn
                : REVIEW_PAGES.default
            }?organization=${context.store.slug}`,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
          }),
        ),
      );
    } catch (error) {
      this.logger.error(error);
    }
  }

  async notifyAnnualLeaveEntitlements(now = new Date()) {
    const windowStart = new Date(
      now.getTime() - ENTITLEMENT_NOTICE_DAYS * 24 * 60 * 60 * 1000,
    );
    const employees = (
      await this.db
        .select({
          id: attendanceEmployee.id,
          organizationId: attendanceEmployee.organizationId,
          hiredAt: attendanceEmployee.hiredAt,
          email: user.email,
          lang: user.lang,
          storeName: organization.name,
          storeSlug: organization.slug,
        })
        .from(attendanceEmployee)
        .innerJoin(user, eq(user.id, attendanceEmployee.userId))
        .innerJoin(
          organization,
          eq(organization.id, attendanceEmployee.organizationId),
        )
        .where(
          and(
            lte(attendanceEmployee.hiredAt, now),
            or(
              isNull(attendanceEmployee.terminatedAt),
              gt(attendanceEmployee.terminatedAt, now),
            ),
          ),
        )
    ).filter((employee) => anniversary(employee.hiredAt, 6) <= now);
    if (!employees.length) return 0;
    const hours = await loadEmployeeHours(this.db, employees);
    const candidates = employees.flatMap((employee) => {
      const period = annualLeaveLedger(
        employee.hiredAt,
        now,
        weeklyMinutesOf(hours.get(employee.id)!),
      ).at(-1);
      return period &&
        period.minutes > 0 &&
        period.start > windowStart &&
        period.start <= now
        ? [{ employee, period }]
        : [];
    });
    let notified = 0;
    for (const { employee, period } of candidates) {
      try {
        await this.db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(attendanceAnnualLeaveNotice)
            .values({
              id: randomUUID(),
              organizationId: employee.organizationId,
              employeeId: employee.id,
              periodStart: period.start,
              periodEnd: period.end,
              grantedMinutes: period.minutes,
            })
            .onConflictDoNothing()
            .returning({ id: attendanceAnnualLeaveNotice.id });
          if (!inserted) return;
          await this.mails.sendAnnualLeaveEntitlement({
            recipient: employee,
            organizationName: employee.storeName,
            path: `${MY_LEAVE_PAGE}?organization=${employee.storeSlug}`,
            periodStart: period.start,
            periodEnd: period.end,
            grantedMinutes: period.minutes,
          });
          notified += 1;
        });
      } catch (error) {
        this.logger.error(error);
      }
    }
    return notified;
  }

  async notifyMissingClockOuts(since: Date, now = new Date()) {
    const scope = and(
      ne(attendanceShift.status, 'cancelled'),
      gt(
        attendanceShift.endsAt,
        new Date(since.getTime() - MAX_DAILY_WORK_SECONDS * 1000),
      ),
      lte(attendanceShift.endsAt, now),
      unfinishedShift,
      sql`NOT EXISTS (SELECT 1 FROM ${attendanceRequest} pending
        WHERE pending.shift_id = ${attendanceShift.id}
          AND pending.kind = 'correction' AND pending.status = 'pending')`,
    );
    const stores = await this.db
      .selectDistinct({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(attendanceShift)
      .innerJoin(
        organization,
        eq(organization.id, attendanceShift.organizationId),
      )
      .where(scope);

    let notified = 0;
    for (const store of stores) {
      try {
        const { data } = await this.shiftsService.shifts(
          { organizationId: store.id, role: 'owner', userId: '' },
          { limit: 500, sortBy: 'startsAt', sortDirection: 'asc' },
          false,
          scope,
        );
        const due = data.filter(
          (shift) =>
            shift.missingClockOut &&
            shift.endsAt.getTime() + punchLeewayMs(shift) > since.getTime(),
        );
        if (!due.length) continue;

        const recipients = await this.db
          .select({
            email: user.email,
            employeeId: attendanceEmployee.id,
            lang: user.lang,
          })
          .from(attendanceEmployee)
          .innerJoin(user, eq(user.id, attendanceEmployee.userId))
          .where(
            inArray(
              attendanceEmployee.id,
              due.map(({ employeeId }) => employeeId),
            ),
          );

        for (const shift of due) {
          const recipient = recipients.find(
            ({ employeeId }) => employeeId === shift.employeeId,
          );
          if (!recipient) continue;

          try {
            await this.mails.sendMissingClockOut({
              recipient: { email: recipient.email, lang: recipient.lang },
              organizationName: store.name,
              path: `${MY_SHIFTS_PAGE}?organization=${store.slug}`,
              startsAt: shift.startsAt,
              endsAt: shift.endsAt,
            });
            notified += 1;
          } catch (error) {
            this.logger.error(error);
          }
        }
      } catch (error) {
        this.logger.error(error);
      }
    }
    return notified;
  }

  @OnEvent(ATTENDANCE_REQUEST_REVIEWED_EVENT, { async: true })
  async onReviewed(event: AttendanceRequestReviewedEvent) {
    try {
      const context = await this.context(
        event.organizationId,
        event.employeeId,
      );
      if (!context || context.employee.userId === event.reviewerUserId) return;
      const [reviewer] = await this.db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, event.reviewerUserId));
      await this.mails.sendAttendanceNotification({
        recipient: context.employee,
        direction: 'reviewed',
        kind: event.kind,
        employeeName: context.employee.name,
        organizationName: context.store.name,
        path: `${MY_REQUESTS_PAGE}?organization=${context.store.slug}`,
        reason: event.reason,
        reviewerName: reviewer?.name ?? '',
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        status: event.status,
      });
    } catch (error) {
      this.logger.error(error);
    }
  }
}
