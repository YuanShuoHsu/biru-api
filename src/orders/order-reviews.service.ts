import { Inject, Injectable } from '@nestjs/common';

import { and, eq, notInArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { accessForbiddenError } from '../common/utils/access-forbidden-error.js';
import { orderReview, orderReviewItem } from '../db/schema/order-reviews.js';
import { order, orderItem } from '../db/schema/orders.js';
import { organization } from '../db/schema/organizations.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import type {
  OrderReviewItemDto,
  OrderReviewResponseDto,
  UpsertOrderReviewDto,
} from './dto/order-review.dto.js';
import { isValidOrderAccessToken } from './order-access-token.js';
import { badRequestError, notFoundError } from './order-errors.js';
import { type OrderViewer, OrdersService } from './orders.service.js';

export const ORDER_REVIEW_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const toResponse = (
  review: typeof orderReview.$inferSelect,
  items: OrderReviewItemDto[],
): OrderReviewResponseDto => ({
  rating: review.rating,
  comment: review.comment,
  items,
  reply: review.reply,
  repliedAt: review.repliedAt,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
  editableUntil: new Date(
    review.createdAt.getTime() + ORDER_REVIEW_EDIT_WINDOW_MS,
  ),
});

@Injectable()
export class OrderReviewsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ordersService: OrdersService,
  ) {}

  private findOrder(
    db: Pick<DrizzleDB, 'select'>,
    organizationSlug: string,
    orderId: string,
  ) {
    return db
      .select({
        sellerId: order.sellerId,
        userId: order.userId,
        orderStatus: order.orderStatus,
      })
      .from(order)
      .innerJoin(organization, eq(organization.id, order.sellerId))
      .where(
        and(eq(order.id, orderId), eq(organization.slug, organizationSlug)),
      );
  }

  async getReview(
    organizationSlug: string,
    orderId: string,
    viewer: OrderViewer | null,
    accessToken: string | null,
  ): Promise<OrderReviewResponseDto | null> {
    const [found] = await this.findOrder(this.db, organizationSlug, orderId);
    if (!found) throw notFoundError('orderNotFound');
    if (
      !(await this.ordersService.canReadOrderById(orderId, viewer, accessToken))
    )
      throw accessForbiddenError();

    const review = await this.db.query.orderReview.findFirst({
      where: eq(orderReview.orderId, orderId),
      with: {
        items: {
          columns: { orderItemId: true, liked: true },
          orderBy: orderReviewItem.orderItemId,
        },
      },
    });
    return review ? toResponse(review, review.items) : null;
  }

  async upsertReview(
    organizationSlug: string,
    orderId: string,
    viewer: OrderViewer | null,
    accessToken: string | null,
    { rating, comment, items = [] }: UpsertOrderReviewDto,
  ): Promise<OrderReviewResponseDto> {
    return this.db.transaction(async (tx) => {
      const [found] = await this.findOrder(tx, organizationSlug, orderId).for(
        'update',
        { of: order },
      );
      if (!found) throw notFoundError('orderNotFound');
      const isCustomer =
        isValidOrderAccessToken(orderId, accessToken) ||
        (!!viewer && !!found.userId && found.userId === viewer.id);
      if (!isCustomer) throw accessForbiddenError();
      if (found.orderStatus !== 'OrderDelivered')
        throw badRequestError('orderNotDelivered');

      const orderItemIds = new Set(
        (
          await tx
            .select({ id: orderItem.id })
            .from(orderItem)
            .where(eq(orderItem.orderId, orderId))
        ).map(({ id }) => id),
      );
      if (items.some(({ orderItemId }) => !orderItemIds.has(orderItemId)))
        throw notFoundError('orderItemNotFound');

      const existing = await tx.query.orderReview.findFirst({
        where: eq(orderReview.orderId, orderId),
        columns: { id: true, createdAt: true },
      });
      if (
        existing &&
        Date.now() >= existing.createdAt.getTime() + ORDER_REVIEW_EDIT_WINDOW_MS
      )
        throw badRequestError('orderReviewLocked');

      const content = { rating, comment: comment || null };
      const [review] = existing
        ? await tx
            .update(orderReview)
            .set(content)
            .where(eq(orderReview.id, existing.id))
            .returning()
        : await tx
            .insert(orderReview)
            .values({
              ...content,
              id: randomUUID(),
              orderId,
              organizationId: found.sellerId,
              userId: found.userId,
            })
            .returning();

      await tx.delete(orderReviewItem).where(
        and(
          eq(orderReviewItem.reviewId, review.id),
          items.length
            ? notInArray(
                orderReviewItem.orderItemId,
                items.map(({ orderItemId }) => orderItemId),
              )
            : undefined,
        ),
      );
      if (items.length)
        await tx
          .insert(orderReviewItem)
          .values(
            items.map(({ orderItemId, liked }) => ({
              id: randomUUID(),
              reviewId: review.id,
              orderItemId,
              liked,
            })),
          )
          .onConflictDoUpdate({
            target: [orderReviewItem.reviewId, orderReviewItem.orderItemId],
            set: { liked: sql`excluded.liked` },
          });

      return toResponse(
        review,
        items.map(({ orderItemId, liked }) => ({ orderItemId, liked })),
      );
    });
  }
}
