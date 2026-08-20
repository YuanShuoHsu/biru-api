import { ECPAY_TRADE_STATUS } from '../dto/query-trade-info-ecpay.dto';

import { OrdersService, PAYMENT_WINDOW_MS } from '../../orders/orders.service';

import { EcpayCallbackLogService } from './ecpay-callback-log.service';
import {
  EcpayQueryTradeInfoService,
  EcpayRateLimitedError,
} from './ecpay-query-trade-info.service';

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

const CANDIDATE_LIMIT_PER_RUN = 100;
const QUERY_LIMIT_PER_RUN = 20;
const QUERY_INTERVAL_MS = 300;

const RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;

const UNPAID_GRACE_MS = 15 * 60 * 1000;

const ESCALATE_AFTER_FAILURES = 3;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class EcpayUnpaidOrderReconcileService {
  private readonly logger = new Logger(EcpayUnpaidOrderReconcileService.name);

  private running = false;
  private rateLimitedUntil = 0;
  private readonly failureCounts = new Map<string, number>();

  constructor(
    private readonly ordersService: OrdersService,
    private readonly ecpayQueryTradeInfoService: EcpayQueryTradeInfoService,
    private readonly ecpayCallbackLogService: EcpayCallbackLogService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcileExpiredUnpaidOrders(): Promise<void> {
    if (this.running) return;
    if (Date.now() < this.rateLimitedUntil) return;

    this.running = true;
    try {
      await this.reconcile();
    } finally {
      this.running = false;
    }
  }

  private async reconcile(): Promise<void> {
    const expired = await this.ordersService.findExpiredUnpaidOrders(
      CANDIDATE_LIMIT_PER_RUN,
    );
    if (!expired.length) return;

    const orderIdsToCancel: string[] = [];
    const pendingQuery: {
      confirmationNumber: string;
      createdAt: Date;
      id: string;
    }[] = [];

    for (const { confirmationNumber, createdAt, id, paymentMethod } of expired)
      if (paymentMethod === 'Cash' || !confirmationNumber)
        orderIdsToCancel.push(id);
      else pendingQuery.push({ confirmationNumber, createdAt, id });

    pendingQuery.sort(
      (a, b) =>
        (this.failureCounts.get(a.id) ?? 0) -
        (this.failureCounts.get(b.id) ?? 0),
    );

    for (const [index, { confirmationNumber, createdAt, id }] of pendingQuery
      .slice(0, QUERY_LIMIT_PER_RUN)
      .entries()) {
      if (index > 0) await sleep(QUERY_INTERVAL_MS);

      try {
        const result =
          await this.ecpayQueryTradeInfoService.queryTradeInfo(
            confirmationNumber,
          );

        this.failureCounts.delete(id);

        const logId = await this.ecpayCallbackLogService.record({
          endpoint: 'query',
          macValid: true,
          merchantTradeNo: confirmationNumber,
          rawBody: result,
        });

        if (result.TradeStatus === ECPAY_TRADE_STATUS.Paid) {
          if (await this.recoverPaidOrder(result))
            await this.ecpayCallbackLogService.markHandled(logId);

          continue;
        }

        if (this.shouldCancel(result.TradeStatus, createdAt)) {
          orderIdsToCancel.push(id);
          await this.ecpayCallbackLogService.markHandled(logId);
          this.failureCounts.delete(id);

          continue;
        }

        this.logger.warn(
          `訂單 ${confirmationNumber} 回傳交易狀態 ${result.TradeStatus}，本輪不取消`,
        );
      } catch (error) {
        if (error instanceof EcpayRateLimitedError) {
          this.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
          this.logger.error(
            `綠界查詢訂單 API 已限速，暫停查證 ${RATE_LIMIT_COOLDOWN_MS / 60000} 分鐘`,
          );

          break;
        }

        const message = error instanceof Error ? error.message : String(error);

        const failures = (this.failureCounts.get(id) ?? 0) + 1;
        this.failureCounts.set(id, failures);

        if (failures >= ESCALATE_AFTER_FAILURES)
          this.logger.error(
            `訂單 ${confirmationNumber} 已連續 ${failures} 次查證失敗，這筆錢收了沒仍無從得知：${message}`,
          );
        else
          this.logger.warn(`查證訂單 ${confirmationNumber} 失敗：${message}`);
      }
    }

    await this.ordersService.cancelOrders(orderIdsToCancel);
  }

  private shouldCancel(tradeStatus: string, createdAt: Date): boolean {
    if (tradeStatus === ECPAY_TRADE_STATUS.NotFound) return true;

    if (tradeStatus !== ECPAY_TRADE_STATUS.Unpaid) return false;

    return (
      createdAt.getTime() < Date.now() - PAYMENT_WINDOW_MS - UNPAID_GRACE_MS
    );
  }

  private async recoverPaidOrder(result: {
    MerchantTradeNo: string;
    PaymentDate: string;
    TradeNo: string;
  }): Promise<boolean> {
    const recovered = await this.ordersService.recordPaymentResult({
      MerchantTradeNo: result.MerchantTradeNo,
      PaymentDate: result.PaymentDate,
      RtnCode: '1',
      TradeNo: result.TradeNo,
    });

    if (recovered)
      this.logger.warn(
        `訂單 ${result.MerchantTradeNo} 在綠界已付款但未收到通知，已自動補正`,
      );

    return recovered;
  }
}
