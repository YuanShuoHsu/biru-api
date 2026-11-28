import { Inject, Injectable } from '@nestjs/common';

import {
  and,
  asc,
  type Column,
  count,
  desc,
  eq,
  ilike,
  inArray,
  notInArray,
  type SQL,
  sql,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { accessForbiddenError } from '../common/utils/access-forbidden-error.js';
import {
  buildFilterCondition,
  buildQuickFilterCondition,
  escapeLike,
} from '../common/utils/data-grid-filters.js';
import { orderByDirection } from '../common/utils/data-grid-sort.js';
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
import {
  STORE_ORDER_REVIEW_BOOLEAN_FILTER_FIELDS,
  STORE_ORDER_REVIEW_DATE_FILTER_FIELDS,
  STORE_ORDER_REVIEW_NUMBER_FILTER_FIELDS,
  type StoreOrderReviewDto,
  type StoreOrderReviewListResponseDto,
  type StoreOrderReviewPaginationQueryDto,
} from './dto/store-order-review.dto.js';
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

const storeReviewColumns = {
  id: orderReview.id,
  orderId: orderReview.orderId,
  orderNumber: order.orderNumber,
  confirmationNumber: order.confirmationNumber,
  rating: orderReview.rating,
  comment: orderReview.comment,
  reply: orderReview.reply,
  repliedAt: orderReview.repliedAt,
  createdAt: orderReview.createdAt,
  updatedAt: orderReview.updatedAt,
};

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

  async listForOrganization(
    organizationId: string,
    query: StoreOrderReviewPaginationQueryDto = {},
  ): Promise<StoreOrderReviewListResponseDto> {
    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterValue,
      sortBy,
      sortDirection = 'asc',
    } = query;

    const fieldMap: Record<string, Column | SQL> = {
      rating: orderReview.rating,
      hasReply: sql`(${orderReview.reply} IS NOT NULL)`,
      createdAt: orderReview.createdAt,
    };

    const where = and(
      eq(orderReview.organizationId, organizationId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            [],
            STORE_ORDER_REVIEW_DATE_FILTER_FIELDS,
            [],
            STORE_ORDER_REVIEW_NUMBER_FILTER_FIELDS,
            [],
            [],
            STORE_ORDER_REVIEW_BOOLEAN_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        fieldMap,
        quickFilterEnums: undefined,
        quickFilterValue,
        textConditions: (value) => [
          ilike(order.orderNumber, `%${escapeLike(value)}%`),
          ilike(order.confirmationNumber, `%${escapeLike(value)}%`),
          ilike(orderReview.comment, `%${escapeLike(value)}%`),
          ilike(orderReview.reply, `%${escapeLike(value)}%`),
        ],
      }),
    );

    const orderBy = sortBy
      ? [
          orderByDirection(fieldMap[sortBy], sortDirection),
          desc(orderReview.createdAt),
          asc(orderReview.id),
        ]
      : [desc(orderReview.createdAt), asc(orderReview.id)];

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select(storeReviewColumns)
        .from(orderReview)
        .innerJoin(order, eq(order.id, orderReview.orderId))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(orderReview)
        .innerJoin(order, eq(order.id, orderReview.orderId))
        .where(where),
    ]);

    return { data: await this.withItems(rows), total };
  }

  async reply(
    organizationId: string,
    reviewId: string,
    repliedBy: string,
    reply: string,
  ): Promise<StoreOrderReviewDto> {
    return this.setReply(organizationId, reviewId, {
      reply,
      repliedAt: new Date(),
      repliedBy,
    });
  }

  async removeReply(
    organizationId: string,
    reviewId: string,
  ): Promise<StoreOrderReviewDto> {
    return this.setReply(organizationId, reviewId, {
      reply: null,
      repliedAt: null,
      repliedBy: null,
    });
  }

  private async setReply(
    organizationId: string,
    reviewId: string,
    values: Pick<
      typeof orderReview.$inferInsert,
      'reply' | 'repliedAt' | 'repliedBy'
    >,
  ): Promise<StoreOrderReviewDto> {
    const [updated] = await this.db
      .update(orderReview)
      .set(values)
      .where(
        and(
          eq(orderReview.id, reviewId),
          eq(orderReview.organizationId, organizationId),
        ),
      )
      .returning({ id: orderReview.id });
    if (!updated) throw notFoundError('orderReviewNotFound');

    const rows = await this.db
      .select(storeReviewColumns)
      .from(orderReview)
      .innerJoin(order, eq(order.id, orderReview.orderId))
      .where(eq(orderReview.id, updated.id));

    const [review] = await this.withItems(rows);
    return review;
  }

  private async withItems(
    rows: Omit<StoreOrderReviewDto, 'items'>[],
  ): Promise<StoreOrderReviewDto[]> {
    if (!rows.length) return [];

    const items = await this.db
      .select({
        reviewId: orderReviewItem.reviewId,
        orderItemId: orderReviewItem.orderItemId,
        menuItemName: orderItem.menuItemName,
        liked: orderReviewItem.liked,
      })
      .from(orderReviewItem)
      .innerJoin(orderItem, eq(orderItem.id, orderReviewItem.orderItemId))
      .where(
        inArray(
          orderReviewItem.reviewId,
          rows.map(({ id }) => id),
        ),
      )
      .orderBy(asc(orderReviewItem.orderItemId));

    return rows.map((row) => ({
      ...row,
      items: items
        .filter(({ reviewId }) => reviewId === row.id)
        .map(({ orderItemId, menuItemName, liked }) => ({
          orderItemId,
          menuItemName,
          liked,
        })),
    }));
  }
}
