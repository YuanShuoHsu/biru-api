import { ECPAY_TRADE_STATUS } from '../dto/query-trade-info-ecpay.dto';

import { OrdersService } from '../../orders/orders.service';

import { EcpayCallbackLogService } from './ecpay-callback-log.service';
import {
  EcpayQueryTradeInfoService,
  EcpayRateLimitedError,
} from './ecpay-query-trade-info.service';

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

const QUERY_LIMIT_PER_RUN = 20;
const QUERY_INTERVAL_MS = 300;

const CANCELLABLE_TRADE_STATUSES: string[] = [
  ECPAY_TRADE_STATUS.Unpaid,
  ECPAY_TRADE_STATUS.Failed,
  ECPAY_TRADE_STATUS.NotFound,
];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class EcpayUnpaidOrderReconcileService {
  private readonly logger = new Logger(EcpayUnpaidOrderReconcileService.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly ecpayQueryTradeInfoService: EcpayQueryTradeInfoService,
    private readonly ecpayCallbackLogService: EcpayCallbackLogService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcileExpiredUnpaidOrders(): Promise<void> {
    const expired = await this.ordersService.findExpiredUnpaidOrders();
    if (!expired.length) return;

    const orderIdsToCancel: string[] = [];
    const pendingQuery: { confirmationNumber: string; id: string }[] = [];

    for (const { confirmationNumber, id, paymentMethod } of expired)
      // 現金訂單不經綠界，沒有可查的交易；先分出來，綠界限速時才不會連帶卡住它們
      if (paymentMethod === 'Cash' || !confirmationNumber)
        orderIdsToCancel.push(id);
      else pendingQuery.push({ confirmationNumber, id });

    // 其餘留待下輪，避免單輪打太多次觸發綠界限速
    for (const [index, { confirmationNumber, id }] of pendingQuery
      .slice(0, QUERY_LIMIT_PER_RUN)
      .entries()) {
      if (index > 0) await sleep(QUERY_INTERVAL_MS);

      try {
        const result =
          await this.ecpayQueryTradeInfoService.queryTradeInfo(
            confirmationNumber,
          );

        await this.ecpayCallbackLogService.record({
          endpoint: 'query',
          macValid: true,
          merchantTradeNo: confirmationNumber,
          rawBody: result,
        });

        if (result.TradeStatus === ECPAY_TRADE_STATUS.Paid) {
          await this.recoverPaidOrder(result);
          continue;
        }

        if (CANCELLABLE_TRADE_STATUSES.includes(result.TradeStatus)) {
          orderIdsToCancel.push(id);
          continue;
        }

        // 未知狀態一律不取消，交由下一輪重查
        this.logger.warn(
          `訂單 ${confirmationNumber} 回傳未預期的交易狀態 ${result.TradeStatus}，本輪不處理`,
        );
      } catch (error) {
        if (error instanceof EcpayRateLimitedError) {
          this.logger.error(
            '綠界查詢訂單 API 已限速，中止本輪查證，未查證的訂單留待下輪處理',
          );
          break;
        }

        this.logger.warn(
          `查證訂單 ${confirmationNumber} 失敗：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await this.ordersService.cancelOrders(orderIdsToCancel);
  }

  private async recoverPaidOrder(result: {
    MerchantTradeNo: string;
    PaymentDate: string;
    TradeNo: string;
  }): Promise<void> {
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
  }
}
