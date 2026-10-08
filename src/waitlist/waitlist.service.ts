import { randomUUID } from 'crypto';

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  max,
  or,
} from 'drizzle-orm';
import {
  ADMIN_BOARD_COLUMN_LIMIT,
  ADMIN_BOARD_DONE_COLUMN_LIMIT,
} from 'src/common/constants/board';
import {
  platformDateString,
  platformMidnight,
} from 'src/common/constants/timezone';
import type { Language } from 'src/db/schema/enums';
import { organization } from 'src/db/schema/organizations';
import {
  WAITLIST_ACTIVE_STATUSES,
  waitlistSetting,
  waitlistTicket,
  waitlistTicketStatusEnum,
  type WaitlistTicket,
  type WaitlistTicketStatus,
} from 'src/db/schema/waitlist';
import { DRIZZLE, type DrizzleDB } from 'src/drizzle/drizzle.module';
import {
  WAITLIST_UPDATED_EVENT,
  type WaitlistUpdatedEvent,
} from 'src/events/waitlist-updated.event';

import type { CreateWaitlistTicketDto } from './dto/create-waitlist-ticket.dto';
import type {
  AdminWaitlistResponseDto,
  AdminWaitlistTicketDto,
  WaitlistStatusResponseDto,
  WaitlistTicketDetailResponseDto,
  WaitlistTicketResponseDto,
} from './dto/waitlist-response.dto';
import type {
  UpdateWaitlistSettingsDto,
  WaitlistSettingsResponseDto,
} from './dto/waitlist-settings.dto';
import { badRequestError, conflictError } from './waitlist-errors';
import {
  canTransition,
  DEFAULT_CUTOFF_MINUTES,
  DEFAULT_GRACE_MINUTES,
  DEFAULT_HOLD_MINUTES,
  DEFAULT_WAITLIST_GROUPS,
  findGroup,
  formatTicketNumber,
  getAvailability,
  getAutoNoShowAt,
  getHoldUntil,
  isOverdue,
  isRevert,
  isValidGroups,
  type StaffTransitionStatus,
} from './waitlist-rules';

const STALE_TICKET_MS = 24 * 60 * 60 * 1000;

const inTodayQueue = (organizationId: string) =>
  and(
    eq(waitlistTicket.organizationId, organizationId),
    or(
      inArray(waitlistTicket.status, [...WAITLIST_ACTIVE_STATUSES]),
      gte(waitlistTicket.serviceDate, platformDateString(new Date())),
      gte(waitlistTicket.endedAt, new Date(platformMidnight(Date.now()))),
    ),
  );

const isActive = (status: WaitlistTicketStatus) =>
  (WAITLIST_ACTIVE_STATUSES as readonly WaitlistTicketStatus[]).includes(
    status,
  );

@Injectable()
export class WaitlistService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async getOrgBySlug(slug: string) {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.slug, slug),
      columns: { id: true, openingHours: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  private async getSettings(
    organizationId: string,
  ): Promise<WaitlistSettingsResponseDto> {
    const setting = await this.db.query.waitlistSetting.findFirst({
      where: eq(waitlistSetting.organizationId, organizationId),
    });

    return {
      cutoffMinutes: setting?.cutoffMinutes ?? DEFAULT_CUTOFF_MINUTES,
      enabled: setting?.enabled || false,
      groups: setting?.groups.length ? setting.groups : DEFAULT_WAITLIST_GROUPS,
      graceMinutes: setting?.graceMinutes ?? DEFAULT_GRACE_MINUTES,
      holdMinutes: setting?.holdMinutes || DEFAULT_HOLD_MINUTES,
      paused: setting?.paused || false,
    };
  }

  private async findTicket(organizationSlug: string, ticketId: string) {
    const org = await this.getOrgBySlug(organizationSlug);
    const ticket = await this.db.query.waitlistTicket.findFirst({
      where: and(
        eq(waitlistTicket.id, ticketId),
        eq(waitlistTicket.organizationId, org.id),
      ),
    });
    if (!ticket) throw new NotFoundException('Waitlist ticket not found');
    return ticket;
  }

  private async countAhead(ticket: WaitlistTicket): Promise<number> {
    if (ticket.status !== 'waiting') return 0;

    const [{ value }] = await this.db
      .select({ value: count() })
      .from(waitlistTicket)
      .where(
        and(
          eq(waitlistTicket.organizationId, ticket.organizationId),
          eq(waitlistTicket.prefix, ticket.prefix),
          eq(waitlistTicket.status, 'waiting'),
          lt(waitlistTicket.createdAt, ticket.createdAt),
        ),
      );

    return value;
  }

  private toTicketResponse(
    ticket: WaitlistTicket,
    aheadCount: number,
    holdMinutes: number,
  ): WaitlistTicketResponseDto {
    return {
      aheadCount,
      calledAt: ticket.calledAt,
      confirmedAt: ticket.confirmedAt,
      createdAt: ticket.createdAt,
      endedAt: ticket.endedAt,
      holdUntil: getHoldUntil(ticket, holdMinutes),
      id: ticket.id,
      partySize: ticket.partySize,
      prefix: ticket.prefix,
      status: ticket.status,
      ticketNumber: formatTicketNumber(ticket.prefix, ticket.number),
    };
  }

  private emitUpdated(
    organizationId: string,
    ticket: WaitlistUpdatedEvent['ticket'],
  ) {
    this.eventEmitter.emit(WAITLIST_UPDATED_EVENT, {
      organizationId,
      ticket,
    } satisfies WaitlistUpdatedEvent);
  }

  async getPublicStatusByOrganizationId(
    organizationId: string,
  ): Promise<WaitlistStatusResponseDto> {
    const org = await this.db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
      columns: { openingHours: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const settings = await this.getSettings(organizationId);
    const tickets = await this.db
      .select({
        calledAt: waitlistTicket.calledAt,
        number: waitlistTicket.number,
        prefix: waitlistTicket.prefix,
        status: waitlistTicket.status,
      })
      .from(waitlistTicket)
      .where(inTodayQueue(organizationId))
      .orderBy(desc(waitlistTicket.calledAt));

    return {
      ...getAvailability(org.openingHours, settings.cutoffMinutes, new Date()),
      enabled: settings.enabled,
      groups: settings.groups.map((group) => {
        const groupTickets = tickets.filter(
          ({ prefix }) => prefix === group.prefix,
        );
        const current = groupTickets.find(({ calledAt }) => calledAt);

        return {
          ...group,
          currentTicketNumber: current
            ? formatTicketNumber(current.prefix, current.number)
            : null,
          waitingCount: groupTickets.filter(
            ({ status }) => status === 'waiting',
          ).length,
        };
      }),
      paused: settings.paused,
    };
  }

  async getPublicStatus(
    organizationSlug: string,
  ): Promise<WaitlistStatusResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);
    return this.getPublicStatusByOrganizationId(org.id);
  }

  async createTicket(
    organizationSlug: string,
    dto: CreateWaitlistTicketDto,
    userId: string | null,
    locale: Language,
    idempotencyKey: string | null,
    byStaff: boolean,
  ): Promise<WaitlistTicketResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);

    const findReplay = (db: Pick<DrizzleDB, 'query'>) =>
      idempotencyKey
        ? db.query.waitlistTicket.findFirst({
            where: and(
              eq(waitlistTicket.organizationId, org.id),
              eq(waitlistTicket.idempotencyKey, idempotencyKey),
            ),
          })
        : undefined;

    const settings = await this.getSettings(org.id);

    const replayed = await findReplay(this.db);
    if (replayed)
      return this.toTicketResponse(
        replayed,
        await this.countAhead(replayed),
        settings.holdMinutes,
      );

    if (!settings.enabled) throw badRequestError('waitlistDisabled');
    // 暫停、營業時間與打烊前停止取號只限制顧客自助取號，店員代客登記不受限
    if (!byStaff && settings.paused) throw badRequestError('waitlistPaused');
    const { cutoff, open } = getAvailability(
      org.openingHours,
      settings.cutoffMinutes,
      new Date(),
    );
    if (!byStaff && !open) throw badRequestError('waitlistClosed');
    if (!byStaff && cutoff) throw badRequestError('waitlistCutoff');

    const group = findGroup(settings.groups, dto.partySize);
    if (!group) throw badRequestError('waitlistPartySizeUnavailable');

    const serviceDate = platformDateString(new Date());

    const { created, ticket } = await this.db.transaction(async (tx) => {
      await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, org.id))
        .for('update');

      const duplicate = await findReplay(tx);
      if (duplicate) return { created: false, ticket: duplicate };

      const inQueue = await tx.query.waitlistTicket.findFirst({
        where: and(
          eq(waitlistTicket.organizationId, org.id),
          eq(waitlistTicket.phoneNumber, dto.phoneNumber),
          inArray(waitlistTicket.status, [...WAITLIST_ACTIVE_STATUSES]),
        ),
        columns: { id: true },
      });
      if (inQueue) throw conflictError('waitlistPhoneInQueue');

      const [{ value: lastNumber }] = await tx
        .select({ value: max(waitlistTicket.number) })
        .from(waitlistTicket)
        .where(
          and(
            eq(waitlistTicket.organizationId, org.id),
            eq(waitlistTicket.serviceDate, serviceDate),
            eq(waitlistTicket.prefix, group.prefix),
          ),
        );

      const [inserted] = await tx
        .insert(waitlistTicket)
        .values({
          id: randomUUID(),
          organizationId: org.id,
          serviceDate,
          prefix: group.prefix,
          number: (lastNumber || 0) + 1,
          partySize: dto.partySize,
          name: dto.name.trim(),
          phoneNumber: dto.phoneNumber,
          email: dto.email || null,
          locale,
          idempotencyKey,
          userId,
        })
        .returning();

      return { created: true, ticket: inserted };
    });

    if (created)
      this.emitUpdated(org.id, { id: ticket.id, status: ticket.status });

    return this.toTicketResponse(
      ticket,
      await this.countAhead(ticket),
      settings.holdMinutes,
    );
  }

  private async getCurrentTicketNumber(
    organizationId: string,
    prefix: string,
  ): Promise<string | null> {
    const [current] = await this.db
      .select({ number: waitlistTicket.number, prefix: waitlistTicket.prefix })
      .from(waitlistTicket)
      .where(
        and(
          inTodayQueue(organizationId),
          eq(waitlistTicket.prefix, prefix),
          isNotNull(waitlistTicket.calledAt),
        ),
      )
      .orderBy(desc(waitlistTicket.calledAt))
      .limit(1);

    return current ? formatTicketNumber(current.prefix, current.number) : null;
  }

  async getTicket(
    organizationSlug: string,
    ticketId: string,
  ): Promise<WaitlistTicketDetailResponseDto> {
    const ticket = await this.findTicket(organizationSlug, ticketId);
    const { holdMinutes } = await this.getSettings(ticket.organizationId);

    return {
      ...this.toTicketResponse(
        ticket,
        await this.countAhead(ticket),
        holdMinutes,
      ),
      currentTicketNumber: await this.getCurrentTicketNumber(
        ticket.organizationId,
        ticket.prefix,
      ),
    };
  }

  private async updateStatus(
    ticket: WaitlistTicket,
    status: WaitlistTicketStatus,
  ): Promise<WaitlistTicket> {
    if (!canTransition(ticket.status, status))
      throw badRequestError('waitlistTransitionInvalid');

    const now = new Date();
    const revert = isRevert(ticket.status, status);
    const [updated] = await this.db
      .update(waitlistTicket)
      .set(
        status === 'waiting'
          ? { calledAt: null, confirmedAt: null, endedAt: null, status }
          : revert
            ? { calledAt: now, endedAt: null, status }
            : status === 'called'
              ? { calledAt: now, status }
              : { endedAt: now, status },
      )
      .where(
        and(
          eq(waitlistTicket.id, ticket.id),
          eq(waitlistTicket.status, ticket.status),
        ),
      )
      .returning()
      .catch((error: unknown) => {
        if ((error as { cause?: { code?: string } }).cause?.code === '23505')
          throw conflictError('waitlistPhoneInQueue');
        throw error;
      });
    if (!updated) throw badRequestError('waitlistTransitionInvalid');

    // 退回不帶號碼牌狀態，避免通知服務把它當成新取號、新叫號而重寄信
    this.emitUpdated(
      updated.organizationId,
      revert ? null : { id: updated.id, status: updated.status },
    );

    return updated;
  }

  async cancelTicket(
    organizationSlug: string,
    ticketId: string,
  ): Promise<WaitlistTicketResponseDto> {
    const ticket = await this.findTicket(organizationSlug, ticketId);
    if (!isActive(ticket.status))
      throw badRequestError('waitlistTransitionInvalid');
    const { holdMinutes } = await this.getSettings(ticket.organizationId);

    return this.toTicketResponse(
      await this.updateStatus(ticket, 'cancelled'),
      0,
      holdMinutes,
    );
  }

  async confirmTicket(
    organizationSlug: string,
    ticketId: string,
  ): Promise<WaitlistTicketResponseDto> {
    const ticket = await this.findTicket(organizationSlug, ticketId);
    if (ticket.status !== 'called')
      throw badRequestError('waitlistTransitionInvalid');
    const { holdMinutes } = await this.getSettings(ticket.organizationId);
    if (ticket.confirmedAt)
      return this.toTicketResponse(ticket, 0, holdMinutes);

    const [updated] = await this.db
      .update(waitlistTicket)
      .set({ confirmedAt: new Date() })
      .where(
        and(
          eq(waitlistTicket.id, ticket.id),
          eq(waitlistTicket.status, 'called'),
        ),
      )
      .returning();
    if (!updated) throw badRequestError('waitlistTransitionInvalid');

    this.emitUpdated(updated.organizationId, null);

    return this.toTicketResponse(updated, 0, holdMinutes);
  }

  async transitionTicket(
    organizationSlug: string,
    ticketId: string,
    status: StaffTransitionStatus,
  ): Promise<WaitlistTicketResponseDto> {
    const ticket = await this.findTicket(organizationSlug, ticketId);
    const updated = await this.updateStatus(ticket, status);
    const { holdMinutes } = await this.getSettings(ticket.organizationId);

    return this.toTicketResponse(
      updated,
      await this.countAhead(updated),
      holdMinutes,
    );
  }

  async listAdmin(organizationSlug: string): Promise<AdminWaitlistResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);
    const settings = await this.getSettings(org.id);
    const now = new Date();

    const tickets = await this.db
      .select()
      .from(waitlistTicket)
      .where(inTodayQueue(org.id))
      .orderBy(asc(waitlistTicket.createdAt));

    const waitingRank = new Map<string, number>();
    const boardTickets = waitlistTicketStatusEnum.enumValues.flatMap(
      (status) => {
        const statusTickets = tickets.filter(
          (ticket) => ticket.status === status,
        );

        return status === 'seated'
          ? statusTickets
              .sort(
                (a, b) =>
                  (b.endedAt?.getTime() || 0) - (a.endedAt?.getTime() || 0),
              )
              .slice(0, ADMIN_BOARD_DONE_COLUMN_LIMIT)
          : statusTickets.slice(0, ADMIN_BOARD_COLUMN_LIMIT);
      },
    );

    return {
      ...settings,
      ...getAvailability(org.openingHours, settings.cutoffMinutes, new Date()),
      tickets: boardTickets.map((ticket): AdminWaitlistTicketDto => {
        const rank = waitingRank.get(ticket.prefix) || 0;
        if (ticket.status === 'waiting')
          waitingRank.set(ticket.prefix, rank + 1);

        return {
          ...this.toTicketResponse(
            ticket,
            ticket.status === 'waiting' ? rank : 0,
            settings.holdMinutes,
          ),
          email: ticket.email,
          name: ticket.name,
          overdue: isOverdue(ticket, settings.holdMinutes, now),
          phoneNumber: ticket.phoneNumber,
        };
      }),
    };
  }

  async getSettingsBySlug(
    organizationSlug: string,
  ): Promise<WaitlistSettingsResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);
    return this.getSettings(org.id);
  }

  async updateSettings(
    organizationSlug: string,
    dto: UpdateWaitlistSettingsDto,
  ): Promise<WaitlistSettingsResponseDto> {
    if (!isValidGroups(dto.groups))
      throw badRequestError('waitlistGroupsInvalid');

    const org = await this.getOrgBySlug(organizationSlug);
    const groups = [...dto.groups]
      .sort((a, b) => a.minPartySize - b.minPartySize)
      .map((group, index) => ({
        ...group,
        prefix: String.fromCharCode(65 + index),
      }));

    const values = {
      cutoffMinutes: dto.cutoffMinutes,
      enabled: dto.enabled,
      groups,
      graceMinutes: dto.graceMinutes,
      holdMinutes: dto.holdMinutes,
    };

    await this.db
      .insert(waitlistSetting)
      .values({ ...values, organizationId: org.id })
      .onConflictDoUpdate({
        target: waitlistSetting.organizationId,
        set: values,
      });

    this.emitUpdated(org.id, null);

    return this.getSettings(org.id);
  }

  async updatePaused(
    organizationSlug: string,
    paused: boolean,
  ): Promise<WaitlistSettingsResponseDto> {
    const org = await this.getOrgBySlug(organizationSlug);

    await this.db
      .insert(waitlistSetting)
      .values({ organizationId: org.id, paused })
      .onConflictDoUpdate({
        target: waitlistSetting.organizationId,
        set: { paused },
      });

    this.emitUpdated(org.id, null);

    return this.getSettings(org.id);
  }

  async processOverdueTickets(since: Date): Promise<number> {
    const now = new Date();
    const rows = await this.db
      .select({
        graceMinutes: waitlistSetting.graceMinutes,
        holdMinutes: waitlistSetting.holdMinutes,
        ticket: waitlistTicket,
      })
      .from(waitlistTicket)
      .leftJoin(
        waitlistSetting,
        eq(waitlistSetting.organizationId, waitlistTicket.organizationId),
      )
      .where(eq(waitlistTicket.status, 'called'));

    const becameOverdue = new Set<string>();
    let skipped = 0;

    for (const { graceMinutes, holdMinutes, ticket } of rows) {
      const hold = holdMinutes || DEFAULT_HOLD_MINUTES;
      const autoNoShowAt = getAutoNoShowAt(
        ticket,
        hold,
        graceMinutes ?? DEFAULT_GRACE_MINUTES,
      );

      if (autoNoShowAt && autoNoShowAt <= now) {
        await this.updateStatus(ticket, 'noShow').then(
          () => skipped++,
          () => {},
        );
      } else if (
        isOverdue(ticket, hold, now) &&
        !isOverdue(ticket, hold, since)
      ) {
        becameOverdue.add(ticket.organizationId);
      }
    }

    for (const organizationId of becameOverdue)
      this.emitUpdated(organizationId, null);

    return skipped;
  }

  async expireStaleTickets(): Promise<number> {
    const expired = await this.db
      .update(waitlistTicket)
      .set({ endedAt: new Date(), status: 'cancelled' })
      .where(
        and(
          inArray(waitlistTicket.status, [...WAITLIST_ACTIVE_STATUSES]),
          lt(waitlistTicket.createdAt, new Date(Date.now() - STALE_TICKET_MS)),
        ),
      )
      .returning({ id: waitlistTicket.id });

    return expired.length;
  }
}
