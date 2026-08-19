import { EcpayOrderInvoiceController } from './ecpay-order-invoice.controller';
import { EcpayOrderRefundController } from './ecpay-order-refund.controller';
import { EcpayController } from './ecpay.controller';

import { EcpayAddInvoiceWordSettingService } from './services/ecpay-add-invoice-word-setting.service';
import { EcpayAllowanceInvoiceService } from './services/ecpay-allowance-invoice.service';
import { EcpayBaseService } from './services/ecpay-base.service';
import { EcpayCallbackLogService } from './services/ecpay-callback-log.service';
import { EcpayCheckBarcodeService } from './services/ecpay-check-barcode.service';
import { EcpayDoActionService } from './services/ecpay-do-action.service';
import { EcpayGetGovInvoiceWordSettingService } from './services/ecpay-get-gov-invoice-word-setting.service';
import { EcpayGetIssueInvoiceService } from './services/ecpay-get-issue-invoice.service';
import { EcpayInvalidInvoiceService } from './services/ecpay-invalid-invoice.service';
import { EcpayInvoicePrintService } from './services/ecpay-invoice-print.service';
import { EcpayGetInvoiceWordSettingService } from './services/ecpay-get-invoice-word-setting.service';
import { EcpayIssueInvoiceService } from './services/ecpay-issue-invoice.service';
import { EcpayOrderInvoiceService } from './services/ecpay-order-invoice.service';
import { EcpayOrderRefundService } from './services/ecpay-order-refund.service';
import { EcpayQueryTradeInfoService } from './services/ecpay-query-trade-info.service';
import { EcpaySyncInvoiceWordSettingsService } from './services/ecpay-sync-invoice-word-settings.service';
import { EcpayUnpaidOrderReconcileService } from './services/ecpay-unpaid-order-reconcile.service';
import { EcpayUpdateInvoiceWordStatusService } from './services/ecpay-update-invoice-word-status.service';

import { CouponsModule } from '../coupons/coupons.module';
import { OrdersModule } from '../orders/orders.module';
import { PointsModule } from '../points/points.module';

import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  imports: [CouponsModule, HttpModule, OrdersModule, PointsModule],
  controllers: [
    EcpayController,
    EcpayOrderInvoiceController,
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
