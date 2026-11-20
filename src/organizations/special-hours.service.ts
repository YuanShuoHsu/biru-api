import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  notExists,
} from 'drizzle-orm';

import { PICKUP_MAX_ADVANCE_DAYS } from '../common/constants/pickup.js';
import {
  DAY_MS,
  platformDateString,
  platformMidnight,
} from '../common/constants/timezone.js';
import { accessForbiddenError } from '../common/utils/access-forbidden-error.js';
import {
  openingCalendar,
  specialHoursOn,
} from '../common/utils/opening-hours.js';
import {
  findSpecialHours,
  getOrganizationIdBySlug,
  organizationNotFoundError,
} from '../common/utils/organizations.js';
import { pgErrorCode } from '../common/utils/pg-errors.js';
import { order } from '../db/schema/orders.js';
import {
  organization,
  organizationSpecialHours,
} from '../db/schema/organizations.js';
import { refund } from '../db/schema/refunds.js';
import {
  WAITLIST_ACTIVE_STATUSES,
  waitlistTicket,
} from '../db/schema/waitlist.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import {
  REFUND_SETTLED_EVENT,
  type RefundSettledEvent,
} from '../events/refund-settled.event.js';
import { EcpayOrderRefundService } from '../ecpay/services/ecpay-order-refund.service.js';
import { MailsService } from '../mails/mails.service.js';
import { getRefundChannel } from '../orders/order-transitions.js';
import { OrdersService } from '../orders/orders.service.js';
import { pickupHoursError } from '../orders/pickup-hours.js';
import { WaitlistService } from '../waitlist/waitlist.service.js';
import {
  formatTicketNumber,
  isClosedTodayBySpecialHours,
} from '../waitlist/waitlist-rules.js';

import type {
  ProcessSpecialHoursAffectedDto,
  SpecialHoursAffectedDto,
  SpecialHoursAffectedOrderDto,
  SpecialHoursProcessResponseDto,
  SpecialHoursProcessResultDto,
  SpecialHoursProcessStatus,
} from './dto/special-hours-affected.dto.js';

import type {
  CreateSpecialHoursDto,
  SpecialHoursDto,
  UpdateSpecialHoursDto,
} from './dto/special-hours.dto.js';
import {
  badRequestError,
  conflictError,
  notFoundError,
} from './organization-errors.js';

type AffectingOrganization = {
  id: string;
  openingHours: string | null;
  pickupCutoffMinutes: number;
};

const codeOf = (error: unknown): string | undefined => {
  if (!(error instanceof HttpException)) return undefined;

  const response = error.getResponse();
  const code =
    typeof response === 'object' && (response as { code?: unknown }).code;

  return typeof code === 'string' ? code : undefined;
};

type SpecialHoursRows = Awaited<ReturnType<typeof findSpecialHours>>;

@Injectable()
export class SpecialHoursService {
  private readonly logger = new Logger(SpecialHoursService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly mailsService: MailsService,
    private readonly ordersService: OrdersService,
    private readonly refundService: EcpayOrderRefundService,
    private readonly waitlistService: WaitlistService,
  ) {}

  async findUpcoming(organizationSlug: string): Promise<SpecialHoursDto[]> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );

    return this.db.query.organizationSpecialHours.findMany({
      where: and(
        eq(organizationSpecialHours.organizationId, organizationId),
        gte(
          organizationSpecialHours.validThrough,
          platformDateString(new Date()),
        ),
      ),
      orderBy: asc(organizationSpecialHours.validFrom),
    });
  }

  async findAffected(
    organizationSlug: string,
    { orders, waitlist }: { orders: boolean; waitlist: boolean },
  ): Promise<SpecialHoursAffectedDto> {
    const { org, specialHours } = await this.findAffecting(organizationSlug);
    const now = new Date();

    return {
      ...(orders && (await this.findAffectedOrders(org, specialHours, now))),
      ...(waitlist && {
        waitlistTickets: await this.findAffectedTickets(org, specialHours, now),
      }),
    };
  }

  async processAffected(
    organizationSlug: string,
    { orderIds = [], ticketIds = [] }: ProcessSpecialHoursAffectedDto,
    { orders, waitlist }: { orders: boolean; waitlist: boolean },
    operatorId: string | undefined,
    idempotencyKey: string | null,
  ): Promise<SpecialHoursProcessResponseDto> {
    if ((orderIds.length && !orders) || (ticketIds.length && !waitlist))
      throw accessForbiddenError();

    const { org } = await this.findAffecting(organizationSlug);
    const result: SpecialHoursProcessResponseDto = {
      orders: [],
      waitlistTickets: [],
    };

    for (const id of orderIds)
      result.orders.push(
        await this.settleFailure(id, () =>
          this.processOrder(organizationSlug, id, operatorId),
        ),
      );

    for (const id of ticketIds)
      result.waitlistTickets.push(
        await this.settleFailure(id, async () => {
          const { org, specialHours } =
            await this.findAffecting(organizationSlug);
          const [ticket] = await this.findAffectedTickets(
            org,
            specialHours,
            new Date(),
            id,
          );
          if (!ticket) return this.previousTicketOutcome(org.id, id);

          try {
            await this.waitlistService.cancelForStoreClosed(
              organizationSlug,
              id,
            );
          } catch (error) {
            if (codeOf(error) === 'waitlistTransitionInvalid')
              return this.previousTicketOutcome(org.id, id);
            throw error;
          }

          return 'cancelled';
        }),
      );

    this.logger.log(
      `特殊營業日批次處理 ${org.id}（Idempotency-Key ${idempotencyKey ?? '無'}）：${JSON.stringify(result)}`,
    );

    return result;
  }

  private async processOrder(
    organizationSlug: string,
    id: string,
    operatorId: string | undefined,
  ): Promise<SpecialHoursProcessStatus> {
    const { org, specialHours } = await this.findAffecting(organizationSlug);
    const { manualRefundOrders, refundOrders, unpaidOrders } =
      await this.findAffectedOrders(org, specialHours, new Date(), id);

    if (unpaidOrders.length) {
      await this.ordersService.applyTransitions(
        organizationSlug,
        [id],
        'OrderCancelled',
      );

      return 'cancelled';
    }
    if (manualRefundOrders.length) return 'manualRefundRequired';

    if (!refundOrders.length) return this.previousOrderOutcome(org.id, id);

    try {
      const { status } = await this.refundService.refundOrder(
        organizationSlug,
        id,
        { reasonCode: 'storeClosed' },
        operatorId,
      );

      return status === 'settled' ? 'refunded' : 'refundPending';
    } catch (error) {
      if (codeOf(error) === 'resultUnknown') return 'refundPending';
      throw error;
    }
  }

  private async previousOrderOutcome(
    organizationId: string,
    orderId: string,
  ): Promise<SpecialHoursProcessStatus> {
    const [previous] = await this.db
      .select({ status: refund.status })
      .from(refund)
      .innerJoin(order, eq(order.id, refund.orderId))
      .where(
        and(
          eq(refund.orderId, orderId),
          eq(order.sellerId, organizationId),
          eq(refund.reasonCode, 'storeClosed'),
        ),
      )
      .orderBy(desc(refund.createdAt))
      .limit(1);
    if (!previous) return 'skipped';

    return previous.status === 'settled' ? 'refunded' : 'refundPending';
  }

  private async previousTicketOutcome(
    organizationId: string,
    ticketId: string,
  ): Promise<SpecialHoursProcessStatus> {
    const cancelled = await this.db.query.waitlistTicket.findFirst({
      where: and(
        eq(waitlistTicket.id, ticketId),
        eq(waitlistTicket.organizationId, organizationId),
        eq(waitlistTicket.status, 'cancelled'),
        eq(waitlistTicket.cancelReason, 'storeClosed'),
      ),
      columns: { id: true },
    });

    return cancelled ? 'cancelled' : 'skipped';
  }

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

      await this.mailsService.sendOrderStoreClosed({
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

  private async settleFailure(
    id: string,
    process: () => Promise<SpecialHoursProcessStatus>,
  ): Promise<SpecialHoursProcessResultDto> {
    try {
      return { id, status: await process() };
    } catch (error) {
      if (!(error instanceof HttpException)) {
        this.logger.error(`特殊營業日批次處理 ${id} 失敗`, error);

        return { id, status: 'failed' };
      }

      const response = error.getResponse();
      const { message } =
        typeof response === 'object'
          ? (response as { message?: unknown })
          : { message: response };
      const code = codeOf(error);

      return {
        id,
        status: 'failed',
        ...(code && { code }),
        ...(typeof message === 'string' && { message }),
      };
    }
  }

  private async findAffecting(organizationSlug: string) {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, organizationSlug),
      columns: { id: true, openingHours: true, pickupCutoffMinutes: true },
    });
    if (!org) throw organizationNotFoundError();

    const now = new Date();
    const specialHours = await findSpecialHours(
      this.db,
      org.id,
      new Date(now.getTime() - DAY_MS),
      new Date(now.getTime() + (PICKUP_MAX_ADVANCE_DAYS + 2) * DAY_MS),
    );

    return { org, specialHours };
  }

  private async findAffectedTickets(
    org: AffectingOrganization,
    specialHours: SpecialHoursRows,
    now: Date,
    ticketId?: string,
  ) {
    if (!isClosedTodayBySpecialHours(org.openingHours, specialHours, now))
      return [];

    return (
      await this.db.query.waitlistTicket.findMany({
        where: and(
          eq(waitlistTicket.organizationId, org.id),
          eq(waitlistTicket.serviceDate, platformDateString(now)),
          inArray(waitlistTicket.status, [...WAITLIST_ACTIVE_STATUSES]),
          ticketId ? eq(waitlistTicket.id, ticketId) : undefined,
        ),
        columns: {
          calledAt: true,
          createdAt: true,
          email: true,
          id: true,
          name: true,
          number: true,
          partySize: true,
          phoneNumber: true,
          prefix: true,
          status: true,
        },
        orderBy: asc(waitlistTicket.createdAt),
      })
    ).map(({ number, prefix, ...ticket }) => ({
      ...ticket,
      ticketNumber: formatTicketNumber(prefix, number),
    }));
  }

  private async findAffectedOrders(
    org: AffectingOrganization,
    specialHours: SpecialHoursRows,
    now: Date,
    orderId?: string,
  ) {
    const affected = {
      manualRefundOrders: [] as SpecialHoursAffectedOrderDto[],
      refundOrders: [] as SpecialHoursAffectedOrderDto[],
      unpaidOrders: [] as SpecialHoursAffectedOrderDto[],
    };
    if (!specialHours.length) return affected;

    const pickups = await this.db.query.order.findMany({
      where: and(
        eq(order.sellerId, org.id),
        orderId ? eq(order.id, orderId) : undefined,
        eq(order.mode, 'pickup'),
        inArray(order.orderStatus, [
          'OrderPaymentDue',
          'OrderProcessing',
          'OrderPickupAvailable',
        ]),
        gte(order.pickupTime, new Date(platformMidnight(now.getTime()))),
        notExists(
          this.db
            .select({ id: refund.id })
            .from(refund)
            .where(
              and(
                eq(refund.orderId, order.id),
                inArray(refund.status, ['pending', 'refunded', 'settling']),
              ),
            ),
        ),
      ),
      columns: {
        customer: true,
        id: true,
        orderNumber: true,
        orderStatus: true,
        paymentDate: true,
        paymentMethod: true,
        pickupTime: true,
        total: true,
      },
      orderBy: asc(order.pickupTime),
    });

    const calendar = openingCalendar(org.openingHours, specialHours);
    const coveredBySpecialHours = (at: Date) =>
      [at, new Date(at.getTime() - DAY_MS)].some(
        (date) => specialHoursOn(specialHours, platformDateString(date)).length,
      );

    for (const pickup of pickups) {
      if (
        !pickup.pickupTime ||
        !coveredBySpecialHours(pickup.pickupTime) ||
        !pickupHoursError(calendar, org.pickupCutoffMinutes, pickup.pickupTime)
      )
        continue;

      if (pickup.orderStatus === 'OrderPaymentDue')
        affected.unpaidOrders.push(pickup);
      else if (getRefundChannel(pickup.paymentMethod) === 'ecpay')
        affected.refundOrders.push(pickup);
      else affected.manualRefundOrders.push(pickup);
    }

    return affected;
  }

  async create(
    organizationSlug: string,
    dto: CreateSpecialHoursDto,
  ): Promise<SpecialHoursDto> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );
    this.assertUpcomingRange(dto);

    const [created] = await this.rejectOverlap(
      { ...dto, organizationId },
      this.db
        .insert(organizationSpecialHours)
        .values({ ...dto, id: randomUUID(), organizationId })
        .returning(),
    );

    return created;
  }

  async update(
    organizationSlug: string,
    id: string,
    dto: UpdateSpecialHoursDto,
  ): Promise<SpecialHoursDto> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );
    const where = and(
      eq(organizationSpecialHours.organizationId, organizationId),
      eq(organizationSpecialHours.id, id),
    );
    const existing = await this.db.query.organizationSpecialHours.findFirst({
      where,
    });
    if (!existing) throw notFoundError('specialHoursNotFound');

    const next = { ...existing, ...dto };
    this.assertUpcomingRange(next);

    const [updated] = await this.rejectOverlap(
      next,
      this.db
        .update(organizationSpecialHours)
        .set({ ...dto, updatedAt: new Date() })
        .where(where)
        .returning(),
    );
    if (!updated) throw notFoundError('specialHoursNotFound');

    return updated;
  }

  async remove(organizationSlug: string, id: string): Promise<void> {
    const organizationId = await getOrganizationIdBySlug(
      this.db,
      organizationSlug,
    );

    const deleted = await this.db
      .delete(organizationSpecialHours)
      .where(
        and(
          eq(organizationSpecialHours.organizationId, organizationId),
          eq(organizationSpecialHours.id, id),
        ),
      )
      .returning({ id: organizationSpecialHours.id });
    if (!deleted.length) throw notFoundError('specialHoursNotFound');
  }

  private assertUpcomingRange({
    validFrom,
    validThrough,
  }: {
    validFrom: string;
    validThrough: string;
  }): void {
    if (validFrom > validThrough)
      throw badRequestError('specialHoursInvalidRange');

    const yearAfter = new Date(validFrom);
    yearAfter.setUTCFullYear(yearAfter.getUTCFullYear() + 1);
    if (validThrough >= yearAfter.toISOString().slice(0, 10))
      throw badRequestError('specialHoursTooLong');

    if (validThrough < platformDateString(new Date()))
      throw badRequestError('specialHoursEnded');
  }

  private async rejectOverlap<T>(
    range: {
      id?: string;
      organizationId: string;
      validFrom: string;
      validThrough: string;
    },
    write: Promise<T>,
  ): Promise<T> {
    try {
      return await write;
    } catch (error) {
      if (pgErrorCode(error) !== '23P01') throw error;

      const conflict = await this.db.query.organizationSpecialHours.findFirst({
        where: and(
          eq(organizationSpecialHours.organizationId, range.organizationId),
          lte(organizationSpecialHours.validFrom, range.validThrough),
          gte(organizationSpecialHours.validThrough, range.validFrom),
          range.id ? ne(organizationSpecialHours.id, range.id) : undefined,
        ),
      });
      if (!conflict) throw error;

      throw conflictError('specialHoursOverlap', conflict, { conflict });
    }
  }
}
