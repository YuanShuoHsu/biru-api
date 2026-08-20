import { EcpayOrderInvoiceController } from './ecpay-order-invoice.controller';
import { EcpayOrderPaymentNotificationController } from './ecpay-order-payment-notification.controller';
import { EcpayOrderRefundController } from './ecpay-order-refund.controller';
import { EcpayController } from './ecpay.controller';

import { EcpayAddInvoiceWordSettingService } from './services/ecpay-add-invoice-word-setting.service';
import { EcpayAllowanceInvoiceService } from './services/ecpay-allowance-invoice.service';
import { EcpayBaseService } from './services/ecpay-base.service';
import { EcpayCallbackLogService } from './services/ecpay-callback-log.service';
import { EcpayCheckBarcodeService } from './services/ecpay-check-barcode.service';
import { EcpayDoActionService } from './services/ecpay-do-action.service';
import { EcpayGetGovInvoiceWordSettingService } from './services/ecpay-get-gov-invoice-word-setting.service';
import { EcpayGetInvoiceWordSettingService } from './services/ecpay-get-invoice-word-setting.service';
import { EcpayGetIssueInvoiceService } from './services/ecpay-get-issue-invoice.service';
import { EcpayInvalidInvoiceService } from './services/ecpay-invalid-invoice.service';
import { EcpayInvoicePrintService } from './services/ecpay-invoice-print.service';
import { EcpayIssueInvoiceService } from './services/ecpay-issue-invoice.service';
import { EcpayOrderInvoiceService } from './services/ecpay-order-invoice.service';
import { EcpayOrderRefundService } from './services/ecpay-order-refund.service';
import { EcpayQueryCreditDetailService } from './services/ecpay-query-credit-detail.service';
import { EcpayQueryTradeInfoService } from './services/ecpay-query-trade-info.service';
import { EcpaySyncInvoiceWordSettingsService } from './services/ecpay-sync-invoice-word-settings.service';
import { EcpayUnpaidOrderReconcileService } from './services/ecpay-unpaid-order-reconcile.service';
import { EcpayUpdateInvoiceWordStatusService } from './services/ecpay-update-invoice-word-status.service';

import { CouponsModule } from '../coupons/coupons.module';
import { OrdersModule } from '../orders/orders.module';
import { PointsModule } from '../points/points.module';

import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const ECPAY_HTTP_TIMEOUT_MS = 15_000;

@Module({
  imports: [
    CouponsModule,
    HttpModule.register({ timeout: ECPAY_HTTP_TIMEOUT_MS }),
    OrdersModule,
    PointsModule,
  ],
  controllers: [
    EcpayController,
    EcpayOrderInvoiceController,
    EcpayOrderPaymentNotificationController,
    EcpayOrderRefundController,
  ],
  providers: [
    EcpayAllowanceInvoiceService,
    EcpayBaseService,
    EcpayCallbackLogService,
    EcpayCheckBarcodeService,
    EcpayDoActionService,
    EcpayInvalidInvoiceService,
    EcpayOrderRefundService,
    EcpayQueryCreditDetailService,
    EcpayQueryTradeInfoService,
    EcpayUnpaidOrderReconcileService,
    EcpayGetGovInvoiceWordSettingService,
    EcpayGetIssueInvoiceService,
    EcpayGetInvoiceWordSettingService,
    EcpayAddInvoiceWordSettingService,
    EcpayUpdateInvoiceWordStatusService,
    EcpayInvoicePrintService,
    EcpayIssueInvoiceService,
    EcpayOrderInvoiceService,
    EcpaySyncInvoiceWordSettingsService,
  ],
})
export class EcpayModule {}
