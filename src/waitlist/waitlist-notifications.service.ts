import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { and, eq, gte, lte, sql } from 'drizzle-orm';
import {
  organization,
  organizationSpecialHours,
} from '../db/schema/organizations.js';
import { user } from '../db/schema/users.js';
import { waitlistSetting, waitlistTicket } from '../db/schema/waitlist.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import {
  WAITLIST_UPDATED_EVENT,
  type WaitlistUpdatedEvent,
} from '../events/waitlist-updated.event.js';
import { MailsService } from '../mails/mails.service.js';
import { NotificationsService } from '../push/notifications.service.js';

import {
  DEFAULT_HOLD_MINUTES,
  formatTicketNumber,
  getHoldUntil,
} from './waitlist-rules.js';

@Injectable()
export class WaitlistNotificationsService {
  private readonly logger = new Logger(WaitlistNotificationsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly mails: MailsService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnEvent(WAITLIST_UPDATED_EVENT, { async: true })
  async onUpdated({ ticket }: WaitlistUpdatedEvent) {
    if (
      ticket?.status !== 'waiting' &&
      ticket?.status !== 'called' &&
      ticket?.status !== 'cancelled'
    )
      return;

    try {
      const [found] = await this.db
        .select({
          calledAt: waitlistTicket.calledAt,
          cancelReason: waitlistTicket.cancelReason,
          email: waitlistTicket.email,
          holdMinutes: waitlistSetting.holdMinutes,
          id: waitlistTicket.id,
          locale: waitlistTicket.locale,
          number: waitlistTicket.number,
          organizationId: waitlistTicket.organizationId,
          organizationName: organization.name,
          organizationSlug: organization.slug,
          partySize: waitlistTicket.partySize,
          prefix: waitlistTicket.prefix,
          serviceDate: waitlistTicket.serviceDate,
          status: waitlistTicket.status,
          userLang: user.lang,
        })
        .from(waitlistTicket)
        .innerJoin(
          organization,
          eq(organization.id, waitlistTicket.organizationId),
        )
        .leftJoin(
          waitlistSetting,
          eq(waitlistSetting.organizationId, waitlistTicket.organizationId),
        )
        .leftJoin(
          user,
          and(
            eq(user.email, sql`lower(${waitlistTicket.email})`),
            eq(user.emailVerified, true),
          ),
        )
        .where(eq(waitlistTicket.id, ticket.id));
      if (!found) return;

      const storeClosed = ticket.status === 'cancelled';
      if (storeClosed && found.cancelReason !== 'storeClosed') return;

      const { email } = found;
      const holdMinutes = found.holdMinutes || DEFAULT_HOLD_MINUTES;
      const kind = storeClosed
        ? 'cancelled'
        : ticket.status === 'waiting'
          ? 'joined'
          : 'called';
      const path = `/waitlist/${found.organizationSlug}/${found.id}`;
      const ticketNumber = formatTicketNumber(found.prefix, found.number);
      const sendMail = email
        ? async () =>
            this.mails.sendWaitlistNotification({
              email,
              holdUntil: getHoldUntil(found, holdMinutes),
              kind,
              lang: found.userLang ?? found.locale,
              note: storeClosed
                ? (
                    await this.db.query.organizationSpecialHours.findFirst({
                      where: and(
                        eq(
                          organizationSpecialHours.organizationId,
                          found.organizationId,
                        ),
                        lte(
                          organizationSpecialHours.validFrom,
                          found.serviceDate,
                        ),
                        gte(
                          organizationSpecialHours.validThrough,
                          found.serviceDate,
                        ),
                      ),
                      columns: { note: true },
                    })
                  )?.note
                : null,
              organizationName: found.organizationName,
              partySize: found.partySize,
              path,
              ticketNumber,
            })
        : null;

      if (kind === 'cancelled') {
        await sendMail?.();
        return;
      }

      await this.notifications.notify(
        { waitlistTicketId: found.id },
        {
          push:
            kind === 'called'
              ? {
                  title: 'push.waitlist_called.title',
                  body: 'push.waitlist_called.body',
                  args: {
                    organizationName: found.organizationName,
                    ticketNumber,
                  },
                  path,
                  ttlSeconds: holdMinutes * 60,
                }
              : null,
          email: sendMail,
        },
      );
    } catch (error) {
      this.logger.error(error);
    }
  }
}
