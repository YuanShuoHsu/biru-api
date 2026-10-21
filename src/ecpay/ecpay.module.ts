import { EcpayOrderInvoiceController } from './ecpay-order-invoice.controller.js';
import { EcpayOrderPaymentNotificationController } from './ecpay-order-payment-notification.controller.js';
import { EcpayOrderRefundController } from './ecpay-order-refund.controller.js';
import { EcpayOrganizationInvoiceController } from './ecpay-organization-invoice.controller.js';
import { EcpayAttentionController } from './ecpay-attention.controller.js';
import { EcpayController } from './ecpay.controller.js';

import { EcpayAddInvoiceWordSettingService } from './services/ecpay-add-invoice-word-setting.service.js';
import { EcpayAllowanceInvoiceService } from './services/ecpay-allowance-invoice.service.js';
import { EcpayAttentionService } from './services/ecpay-attention.service.js';
import { EcpayBaseService } from './services/ecpay-base.service.js';
import { EcpayCallbackLogService } from './services/ecpay-callback-log.service.js';
import { EcpayCheckBarcodeService } from './services/ecpay-check-barcode.service.js';
import { EcpayDoActionService } from './services/ecpay-do-action.service.js';
import { EcpayGetGovInvoiceWordSettingService } from './services/ecpay-get-gov-invoice-word-setting.service.js';
import { EcpayGetInvoiceWordSettingService } from './services/ecpay-get-invoice-word-setting.service.js';
import { EcpayGetIssueInvoiceService } from './services/ecpay-get-issue-invoice.service.js';
import { EcpayInvalidInvoiceService } from './services/ecpay-invalid-invoice.service.js';
import { EcpayInvoicePrintService } from './services/ecpay-invoice-print.service.js';
import { EcpayIssueInvoiceService } from './services/ecpay-issue-invoice.service.js';
import { EcpayOrderInvoiceService } from './services/ecpay-order-invoice.service.js';
import { EcpayOrderRefundService } from './services/ecpay-order-refund.service.js';
import { EcpayQueryCreditDetailService } from './services/ecpay-query-credit-detail.service.js';
import { EcpayQueryTradeInfoService } from './services/ecpay-query-trade-info.service.js';
import { EcpaySyncInvoiceWordSettingsService } from './services/ecpay-sync-invoice-word-settings.service.js';
import { EcpayUnpaidOrderReconcileService } from './services/ecpay-unpaid-order-reconcile.service.js';
import { EcpayUpdateInvoiceWordStatusService } from './services/ecpay-update-invoice-word-status.service.js';

import { CouponsModule } from '../coupons/coupons.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PointsModule } from '../points/points.module.js';

import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const ECPAY_HTTP_TIMEOUT_MS = 15_000;

@Module({
  imports: [
    CouponsModule,
    InventoryModule,
    HttpModule.register({ timeout: ECPAY_HTTP_TIMEOUT_MS }),
    OrdersModule,
    PointsModule,
  ],
  controllers: [
    EcpayAttentionController,
    EcpayController,
    EcpayOrderInvoiceController,
    EcpayOrderPaymentNotificationController,
    EcpayOrderRefundController,
    EcpayOrganizationInvoiceController,
  ],
  providers: [
    EcpayAllowanceInvoiceService,
    EcpayAttentionService,
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
