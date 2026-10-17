import { EventEmitter2 } from '@nestjs/event-emitter';

import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
  type QuantBot,
  type QuantBotFill,
  type QuantBotOrder,
  quantBot,
  quantBotEvent,
  quantBotFill,
  quantBotOrder,
} from 'src/db/schema/quant';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import type { SessionStore, SubmittedOrder } from './bot-session';
import { botClientOrderId } from './client-order-id';
import type { FundingPayment } from './futures-account';
import type { BotFill, SymbolSpec } from './types';

export const QUANT_BOT_CHANGED_EVENT = 'quant.bot.changed';

export interface QuantBotChangedEvent {
  botId: string;
  userId: string;
}

export const FUNDING_EVENT = 'funding';

const optional = <T>(value: T | null) => value ?? undefined;

export const toSubmittedOrder = (row: QuantBotOrder): SubmittedOrder => ({
  amount: optional(row.amount),
  clientOrderId: row.clientOrderId,
  exchangeOrderId: optional(row.exchangeOrderId),
  filledAmount: row.filledAmount,
  filledSize: row.filledSize,
  id: row.id,
  price: optional(row.price),
  side: row.side,
  size: optional(row.size),
  status: row.status,
  tag: optional(row.tag),
  type: row.type,
});

export const toBotFill = (row: QuantBotFill, spec: SymbolSpec): BotFill => ({
  fee: row.fee,
  feeAsset: row.feeCoin === spec.base ? 'base' : 'quote',
  id: row.id,
  orderId: row.orderId,
  price: row.price,
  side: row.side,
  size: row.size,
  time: row.filledAt.getTime(),
});

export class BotStore implements SessionStore {
  constructor(
    private readonly db: DrizzleDB,
    private readonly eventEmitter: EventEmitter2,
    private readonly bot: QuantBot,
    private readonly spec: SymbolSpec,
  ) {}

  private changed() {
    this.eventEmitter.emit(QUANT_BOT_CHANGED_EVENT, {
      botId: this.bot.id,
      userId: this.bot.userId,
    } satisfies QuantBotChangedEvent);
  }

  async insertOrder(order: SubmittedOrder) {
    await this.db.insert(quantBotOrder).values({
      amount: order.amount,
      botId: this.bot.id,
      clientOrderId: order.clientOrderId,
      exchangeOrderId: order.exchangeOrderId,
      id: order.id,
      price: order.price,
      side: order.side,
      size: order.size,
      status: order.status,
      tag: order.tag,
      type: order.type,
    });
    this.changed();
  }

  async updateOrder(order: SubmittedOrder) {
    await this.db
      .update(quantBotOrder)
      .set({
        exchangeOrderId: order.exchangeOrderId,
        filledAmount: order.filledAmount,
        filledSize: order.filledSize,
        status: order.status,
      })
      .where(eq(quantBotOrder.id, order.id));
    this.changed();
  }

  async insertFill(fill: BotFill) {
    await this.db
      .insert(quantBotFill)
      .values({
        botId: this.bot.id,
        fee: fill.fee,
        feeCoin: fill.feeAsset === 'base' ? this.spec.base : this.spec.quote,
        filledAt: new Date(fill.time),
        id: fill.id ?? randomUUID(),
        orderId: fill.orderId,
        price: fill.price,
        side: fill.side,
        size: fill.size,
      })
      .onConflictDoNothing();
    this.changed();
  }

  // 重啟時要從這些事件還原保證金，所以和成交一樣等寫入完成
  async insertFunding({
    amount,
    rate,
    time,
  }: FundingPayment & { rate: number }) {
    await this.db.insert(quantBotEvent).values({
      botId: this.bot.id,
      id: randomUUID(),
      kind: FUNDING_EVENT,
      payload: { amount, rate, time },
    });
    this.changed();
  }

  log(kind: string, payload?: Record<string, unknown>) {
    void this.db
      .insert(quantBotEvent)
      .values({ botId: this.bot.id, id: randomUUID(), kind, payload })
      .then(() => this.changed());
  }

  async nextClientOrderId() {
    const [{ orderSequence }] = await this.db
      .update(quantBot)
      .set({ orderSequence: sql`${quantBot.orderSequence} + 1` })
      .where(eq(quantBot.id, this.bot.id))
      .returning({ orderSequence: quantBot.orderSequence });

    return botClientOrderId(this.bot.id, orderSequence);
  }

  async setStopped(reason: string, error: boolean) {
    await this.db
      .update(quantBot)
      .set({
        status: error ? 'error' : 'stopped',
        statusReason: reason,
        stoppedAt: new Date(),
      })
      .where(eq(quantBot.id, this.bot.id));
    this.changed();
  }
}
