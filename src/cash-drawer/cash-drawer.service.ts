import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import {
  cashDrawerMovement,
  cashDrawerSession,
  cashDrawerSetting,
  type CashDrawerSession,
} from '../db/schema/cash-drawer.js';
import { order } from '../db/schema/orders.js';
import { refund } from '../db/schema/refunds.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { platformDateString } from '../common/constants/timezone.js';
import { utcTimestampParam } from '../common/utils/stats-buckets.js';

import {
  COUNTED_AT,
  isConfirmedRefund,
  isCountedOrder,
} from '../orders/counted-orders.js';

import type {
  CashDrawerSessionDto,
  CloseCashDrawerDto,
  CreateCashDrawerMovementDto,
  CurrentCashDrawerDto,
  OpenCashDrawerDto,
} from './dto/cash-drawer.dto.js';

type Tx = Pick<DrizzleDB, 'select'>;

const toCents = (amount: string): number => Math.round(Number(amount) * 100);
const fromCents = (cents: number): string => (cents / 100).toFixed(2);

@Injectable()
export class CashDrawerService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  private t(key: keyof I18nTranslations['common']['cashDrawer']): string {
    return this.i18n.t(`common.cashDrawer.${key}`, {
      lang: I18nContext.current()?.lang,
    });
  }

  private async settingOf(tx: Tx, organizationId: string) {
    const [found] = await tx
      .select({
        handoverEnabled: cashDrawerSetting.handoverEnabled,
        varianceTolerance: cashDrawerSetting.varianceTolerance,
      })
      .from(cashDrawerSetting)
      .where(eq(cashDrawerSetting.organizationId, organizationId));

    return found ?? { handoverEnabled: false, varianceTolerance: '0.00' };
  }

  private async describe(
    tx: Tx,
    session: CashDrawerSession,
  ): Promise<CashDrawerSessionDto> {
    const since = utcTimestampParam(session.openedAt);
    const until = utcTimestampParam(session.closedAt ?? new Date());

    const [movements, [{ cashSales }], [{ cashRefunds }]] = await Promise.all([
      tx
        .select({
          id: cashDrawerMovement.id,
          amount: cashDrawerMovement.amount,
          createdAt: cashDrawerMovement.createdAt,
          createdBy: cashDrawerMovement.createdBy,
          reason: cashDrawerMovement.reason,
          type: cashDrawerMovement.type,
        })
        .from(cashDrawerMovement)
        .where(eq(cashDrawerMovement.sessionId, session.id))
        .orderBy(asc(cashDrawerMovement.createdAt), asc(cashDrawerMovement.id)),
      tx
        .select({
          cashSales: sql<string>`COALESCE(SUM(${order.total}), 0)`,
        })
        .from(order)
        .where(
          and(
            eq(order.sellerId, session.organizationId),
            eq(order.paymentMethod, 'Cash'),
            isCountedOrder,
            gte(COUNTED_AT, since),
            lt(COUNTED_AT, until),
          ),
        ),
      tx
        .select({
          cashRefunds: sql<string>`COALESCE(SUM(${refund.amount}), 0)`,
        })
        .from(refund)
        .innerJoin(order, eq(order.id, refund.orderId))
        .where(
          and(
            eq(order.sellerId, session.organizationId),
            eq(order.paymentMethod, 'Cash'),
            isConfirmedRefund,
            gte(refund.createdAt, since),
            lt(refund.createdAt, until),
          ),
        ),
    ]);

    const sumOf = (type: 'payIn' | 'payOut') =>
      movements
        .filter((movement) => movement.type === type)
        .reduce((sum, movement) => sum + toCents(movement.amount), 0);
    const payIns = sumOf('payIn');
    const payOuts = sumOf('payOut');

    return {
      id: session.id,
      businessDate: session.businessDate,
      closedAt: session.closedAt,
      closedBy: session.closedBy,
      countedCash: session.countedCash,
      expectedCash: session.expectedCash,
      movements,
      openedAt: session.openedAt,
      openedBy: session.openedBy,
      openingFloat: session.openingFloat,
      retainedFloat: session.retainedFloat,
      status: session.status,
      summary: {
        cashRefunds: fromCents(toCents(cashRefunds)),
        cashSales: fromCents(toCents(cashSales)),
        expectedCash: fromCents(
          toCents(session.openingFloat) +
            toCents(cashSales) -
            toCents(cashRefunds) +
            payIns -
            payOuts,
        ),
        payIns: fromCents(payIns),
        payOuts: fromCents(payOuts),
      },
      varianceNote: session.varianceNote,
    };
  }

  private async lockOpenSession(
    tx: Tx,
    organizationId: string,
    sessionId: string,
  ): Promise<CashDrawerSession> {
    const [found] = await tx
      .select()
      .from(cashDrawerSession)
      .where(
        and(
          eq(cashDrawerSession.id, sessionId),
          eq(cashDrawerSession.organizationId, organizationId),
        ),
      )
      .for('update');
    if (!found) throw new NotFoundException(this.t('notOpen'));
    if (found.status !== 'open') throw new ConflictException(this.t('notOpen'));

    return found;
  }

  private async lastRetainedFloat(
    tx: Tx,
    organizationId: string,
  ): Promise<string> {
    const [lastClosed] = await tx
      .select({ retainedFloat: cashDrawerSession.retainedFloat })
      .from(cashDrawerSession)
      .where(
        and(
          eq(cashDrawerSession.organizationId, organizationId),
          eq(cashDrawerSession.status, 'closed'),
        ),
      )
      .orderBy(desc(cashDrawerSession.closedAt))
      .limit(1);

    return lastClosed?.retainedFloat ?? '0.00';
  }

  async getCurrent(organizationId: string): Promise<CurrentCashDrawerDto> {
    const [[open], suggestedOpeningFloat, setting] = await Promise.all([
      this.db
        .select()
        .from(cashDrawerSession)
        .where(
          and(
            eq(cashDrawerSession.organizationId, organizationId),
            eq(cashDrawerSession.status, 'open'),
          ),
        ),
      this.lastRetainedFloat(this.db, organizationId),
      this.settingOf(this.db, organizationId),
    ]);

    return {
      session: open ? await this.describe(this.db, open) : null,
      suggestedOpeningFloat,
      varianceTolerance: setting.varianceTolerance,
    };
  }

  async open(
    organizationId: string,
    { openingFloat }: OpenCashDrawerDto,
    openedBy: string,
  ): Promise<CashDrawerSessionDto> {
    const businessDate = platformDateString(new Date());

    try {
      return await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`,
        );
        const setting = await this.settingOf(tx, organizationId);

        if (!setting.handoverEnabled) {
          const [closedToday] = await tx
            .select({ id: cashDrawerSession.id })
            .from(cashDrawerSession)
            .where(
              and(
                eq(cashDrawerSession.organizationId, organizationId),
                eq(cashDrawerSession.businessDate, businessDate),
                eq(cashDrawerSession.status, 'closed'),
              ),
            )
            .limit(1);
          if (closedToday)
            throw new ConflictException(this.t('alreadyClosedToday'));
        }

        const [created] = await tx
          .insert(cashDrawerSession)
          .values({
            id: randomUUID(),
            businessDate,
            openedBy,
            openingFloat:
              openingFloat ??
              (await this.lastRetainedFloat(tx, organizationId)),
            organizationId,
          })
          .returning();

        return this.describe(tx, created);
      });
    } catch (error) {
      if ((error as { cause?: { code?: string } }).cause?.code === '23505')
        throw new ConflictException(this.t('alreadyOpen'));
      throw error;
    }
  }

  async addMovement(
    organizationId: string,
    sessionId: string,
    { amount, reason, type }: CreateCashDrawerMovementDto,
    createdBy: string,
  ): Promise<CashDrawerSessionDto> {
    return this.db.transaction(async (tx) => {
      const session = await this.lockOpenSession(tx, organizationId, sessionId);
      await tx.insert(cashDrawerMovement).values({
        id: randomUUID(),
        amount,
        createdBy,
        reason: reason.trim(),
        sessionId,
        type,
      });

      return this.describe(tx, session);
    });
  }

  async close(
    organizationId: string,
    sessionId: string,
    { countedCash, retainedFloat, varianceNote }: CloseCashDrawerDto,
    closedBy: string,
  ): Promise<CashDrawerSessionDto> {
    if (toCents(retainedFloat) > toCents(countedCash))
      throw new BadRequestException(this.t('retainedExceedsCounted'));

    return this.db.transaction(async (tx) => {
      const session = await this.lockOpenSession(tx, organizationId, sessionId);
      const closedAt = new Date();
      const [described, setting] = await Promise.all([
        this.describe(tx, { ...session, closedAt }),
        this.settingOf(tx, organizationId),
      ]);

      const variance = Math.abs(
        toCents(countedCash) - toCents(described.summary.expectedCash),
      );
      const note = varianceNote?.trim() ?? null;
      if (variance > toCents(setting.varianceTolerance) && !note)
        throw new BadRequestException(this.t('varianceNoteRequired'));

      const [closed] = await tx
        .update(cashDrawerSession)
        .set({
          closedAt,
          closedBy,
          countedCash,
          expectedCash: described.summary.expectedCash,
          retainedFloat,
          status: 'closed',
          updatedAt: closedAt,
          varianceNote: note,
        })
        .where(eq(cashDrawerSession.id, session.id))
        .returning();

      return {
        ...described,
        closedAt: closed.closedAt,
        closedBy: closed.closedBy,
        countedCash: closed.countedCash,
        expectedCash: closed.expectedCash,
        retainedFloat: closed.retainedFloat,
        status: closed.status,
        varianceNote: closed.varianceNote,
      };
    });
  }
}
