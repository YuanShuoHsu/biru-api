import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { eq } from 'drizzle-orm';
import { organization } from '../db/schema/organizations.js';
import { waitlistSetting, waitlistTicket } from '../db/schema/waitlist.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import {
  WAITLIST_UPDATED_EVENT,
  type WaitlistUpdatedEvent,
} from '../events/waitlist-updated.event.js';
import { MailsService } from '../mails/mails.service.js';

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
  ) {}

  @OnEvent(WAITLIST_UPDATED_EVENT, { async: true })
  async onUpdated({ ticket }: WaitlistUpdatedEvent) {
    if (ticket?.status !== 'waiting' && ticket?.status !== 'called') return;

    try {
      const [found] = await this.db
        .select({
          calledAt: waitlistTicket.calledAt,
          email: waitlistTicket.email,
          holdMinutes: waitlistSetting.holdMinutes,
          id: waitlistTicket.id,
          locale: waitlistTicket.locale,
          number: waitlistTicket.number,
          organizationName: organization.name,
          organizationSlug: organization.slug,
          partySize: waitlistTicket.partySize,
          prefix: waitlistTicket.prefix,
          status: waitlistTicket.status,
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
        .where(eq(waitlistTicket.id, ticket.id));
      if (!found?.email) return;

      await this.mails.sendWaitlistNotification({
        email: found.email,
        holdUntil: getHoldUntil(
          found,
          found.holdMinutes || DEFAULT_HOLD_MINUTES,
        ),
        kind: ticket.status === 'waiting' ? 'joined' : 'called',
        lang: found.locale,
        organizationName: found.organizationName,
        partySize: found.partySize,
        path: `/waitlist/${found.organizationSlug}/${found.id}`,
        ticketNumber: formatTicketNumber(found.prefix, found.number),
      });
    } catch (error) {
      this.logger.error(error);
    }
  }
}
