import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { eq } from 'drizzle-orm';

import { order } from '../db/schema/orders.js';
import { organization } from '../db/schema/organizations.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import {
  ORDER_STATUS_UPDATED_EVENT,
  type OrderStatusUpdatedEvent,
} from '../events/order-status-updated.event.js';
import { NotificationsService } from '../push/notifications.service.js';

import { orderAccessToken } from './order-access-token.js';
import { ORDER_PAGE_MODES } from './order-page-modes.js';

const PICKUP_PUSH_TTL_SECONDS = 60 * 60;

@Injectable()
export class OrderPickupNotificationsService {
  private readonly logger = new Logger(OrderPickupNotificationsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly notifications: NotificationsService,
  ) {}

  @OnEvent(ORDER_STATUS_UPDATED_EVENT, { async: true })
  async onStatusUpdated({
    orderId,
    orderStatus,
    direction,
  }: OrderStatusUpdatedEvent) {
    if (orderStatus !== 'OrderPickupAvailable' || direction !== 'advance')
      return;

    try {
      const [found] = await this.db
        .select({
          mode: order.mode,
          orderNumber: order.orderNumber,
          organizationName: organization.name,
          organizationSlug: organization.slug,
        })
        .from(order)
        .innerJoin(organization, eq(organization.id, order.sellerId))
        .where(eq(order.id, orderId));
      if (!found) return;

      const search = new URLSearchParams({
        orderId,
        accessToken: orderAccessToken(orderId),
      });
      await this.notifications.notify(
        { orderId },
        {
          push: {
            title: 'push.order_pickup_available.title',
            body: 'push.order_pickup_available.body',
            args: {
              orderNumber: found.orderNumber,
              organizationName: found.organizationName,
            },
            path: `/order/${ORDER_PAGE_MODES[found.mode]}/${encodeURIComponent(found.organizationSlug)}/complete?${search}`,
            ttlSeconds: PICKUP_PUSH_TTL_SECONDS,
          },
          email: null,
        },
      );
    } catch (error) {
      this.logger.error(error);
    }
  }
}
