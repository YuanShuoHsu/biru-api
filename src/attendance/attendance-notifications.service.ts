import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { and, eq, inArray } from 'drizzle-orm';

import { attendanceEmployee } from 'src/db/schema/attendance';
import { organization } from 'src/db/schema/organizations';
import { user } from 'src/db/schema/users';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';
import { MailsService } from 'src/mails/mails.service';

import {
  ATTENDANCE_REQUEST_REVIEWED_EVENT,
  ATTENDANCE_REQUEST_SUBMITTED_EVENT,
  type AttendanceRequestReviewedEvent,
  type AttendanceRequestSubmittedEvent,
} from './attendance-notification.events';
import { reviewerUserIds } from './review-separation';

const REVIEW_PAGES = {
  parentalReturn: '/attendance/leave/parental-returns',
  default: '/attendance/records/reviews',
} as const;

const MY_REQUESTS_PAGE = '/attendance/mine/requests';

@Injectable()
export class AttendanceNotificationsService {
  private readonly logger = new Logger(AttendanceNotificationsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly mails: MailsService,
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
