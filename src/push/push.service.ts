import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { UserSession } from '@thallesp/nestjs-better-auth';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { I18nContext } from 'nestjs-i18n';

import { accessForbiddenError } from '../common/utils/access-forbidden-error.js';
import { toLanguage } from '../common/utils/language.js';
import { ORDER_ENDED_STATUSES, order } from '../db/schema/orders.js';
import { pushSubscription } from '../db/schema/push.js';
import {
  WAITLIST_ENDED_STATUSES,
  waitlistTicket,
} from '../db/schema/waitlist.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import { OrdersService } from '../orders/orders.service.js';
import { WaitlistService } from '../waitlist/waitlist.service.js';

import type {
  CreatePushSubscriptionDto,
  DeletePushSubscriptionDto,
} from './dto/push-subscription.dto.js';

type PushViewer = Pick<UserSession['user'], 'id' | 'role'>;

@Injectable()
export class PushService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ordersService: OrdersService,
    private readonly waitlistService: WaitlistService,
  ) {}

  async subscribe(
    {
      endpoint,
      keys: { p256dh, auth },
      app,
      lang,
      orderId,
      accessToken,
      organizationSlug,
      waitlistTicketId,
    }: CreatePushSubscriptionDto,
    viewer: PushViewer | null,
  ): Promise<void> {
    if (!viewer && (app === 'admin' || (!orderId && !waitlistTicketId)))
      throw accessForbiddenError();

    if (
      orderId &&
      !(await this.ordersService.canReadOrderById(
        orderId,
        viewer,
        accessToken ?? null,
      ))
    )
      throw accessForbiddenError();

    if (organizationSlug && waitlistTicketId)
      await this.waitlistService.findActiveTicket(
        organizationSlug,
        waitlistTicketId,
      );

    const values = {
      endpoint,
      p256dh,
      auth,
      lang: lang ?? toLanguage(I18nContext.current()?.lang),
      app,
      userId: viewer?.id ?? null,
      orderId: orderId ?? null,
      waitlistTicketId: waitlistTicketId ?? null,
    };

    await this.db
      .insert(pushSubscription)
      .values({ id: randomUUID(), ...values })
      .onConflictDoUpdate({
        target: pushSubscription.endpoint,
        set: { ...values, updatedAt: new Date() },
      });
  }

  async unsubscribe({ endpoint }: DeletePushSubscriptionDto): Promise<void> {
    await this.db
      .delete(pushSubscription)
      .where(eq(pushSubscription.endpoint, endpoint));
  }

  async purgeEnded(): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx
        .update(pushSubscription)
        .set({ orderId: null })
        .where(
          inArray(
            pushSubscription.orderId,
            tx
              .select({ id: order.id })
              .from(order)
              .where(inArray(order.orderStatus, [...ORDER_ENDED_STATUSES])),
          ),
        );
      await tx
        .update(pushSubscription)
        .set({ waitlistTicketId: null })
        .where(
          inArray(
            pushSubscription.waitlistTicketId,
            tx
              .select({ id: waitlistTicket.id })
              .from(waitlistTicket)
              .where(
                inArray(waitlistTicket.status, [...WAITLIST_ENDED_STATUSES]),
              ),
          ),
        );

      const deleted = await tx
        .delete(pushSubscription)
        .where(
          and(
            isNull(pushSubscription.userId),
            isNull(pushSubscription.orderId),
            isNull(pushSubscription.waitlistTicketId),
          ),
        )
        .returning({ id: pushSubscription.id });

      return deleted.length;
    });
  }
}
