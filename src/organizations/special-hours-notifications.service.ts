import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { eq } from 'drizzle-orm';

import { DAY_MS, platformDateString } from '../common/constants/timezone.js';
import { specialHoursOn } from '../common/utils/opening-hours.js';
import { findSpecialHours } from '../common/utils/organizations.js';
import { refund } from '../db/schema/refunds.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import {
  REFUND_SETTLED_EVENT,
  type RefundSettledEvent,
} from '../events/refund-settled.event.js';
import { MailsService } from '../mails/mails.service.js';

@Injectable()
export class SpecialHoursNotificationsService {
  private readonly logger = new Logger(SpecialHoursNotificationsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly mails: MailsService,
  ) {}

  @OnEvent(REFUND_SETTLED_EVENT, { async: true })
  async onRefundSettled({
    reasonCode,
    refundId,
  }: RefundSettledEvent): Promise<void> {
    if (reasonCode !== 'storeClosed') return;

    try {
      const settled = await this.db.query.refund.findFirst({
        where: eq(refund.id, refundId),
        columns: { amount: true },
        with: {
          order: {
            columns: {
              customer: true,
              orderNumber: true,
              pickupTime: true,
              sellerId: true,
            },
            with: {
              seller: { columns: { name: true } },
              user: { columns: { lang: true } },
            },
          },
        },
      });
      const email = settled?.order.customer.email;
      if (!email || !settled.order.pickupTime) return;

      const { orderNumber, pickupTime, seller, sellerId, user } = settled.order;
      const dates = [pickupTime, new Date(pickupTime.getTime() - DAY_MS)];
      const specialHours = await findSpecialHours(
        this.db,
        sellerId,
        dates[1],
        dates[0],
      );

      await this.mails.sendOrderStoreClosed({
        amount: settled.amount,
        email,
        lang: user?.lang ?? null,
        note:
          dates
            .flatMap((date) =>
              specialHoursOn(specialHours, platformDateString(date)),
            )
            .find(({ note }) => note)?.note ?? null,
        orderNumber,
        organizationName: seller.name,
        pickupTime,
      });
    } catch (error) {
      this.logger.error(`退款 ${refundId} 的門市公休通知寄送失敗`, error);
    }
  }
}
