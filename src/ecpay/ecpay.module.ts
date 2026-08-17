import { EcpayOrderInvoiceController } from './ecpay-order-invoice.controller';
import { EcpayController } from './ecpay.controller';

import { EcpayAddInvoiceWordSettingService } from './services/ecpay-add-invoice-word-setting.service';
import { EcpayBaseService } from './services/ecpay-base.service';
import { EcpayCheckBarcodeService } from './services/ecpay-check-barcode.service';
import { EcpayGetGovInvoiceWordSettingService } from './services/ecpay-get-gov-invoice-word-setting.service';
import { EcpayInvoicePrintService } from './services/ecpay-invoice-print.service';
import { EcpayGetInvoiceWordSettingService } from './services/ecpay-get-invoice-word-setting.service';
import { EcpayIssueInvoiceService } from './services/ecpay-issue-invoice.service';
import { EcpayOrderInvoiceService } from './services/ecpay-order-invoice.service';
import { EcpaySyncInvoiceWordSettingsService } from './services/ecpay-sync-invoice-word-settings.service';
import { EcpayUpdateInvoiceWordStatusService } from './services/ecpay-update-invoice-word-status.service';

import { OrdersModule } from '../orders/orders.module';

import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  imports: [HttpModule, OrdersModule],
  controllers: [EcpayController, EcpayOrderInvoiceController],
  providers: [
    EcpayBaseService,
    EcpayCheckBarcodeService,
    EcpayGetGovInvoiceWordSettingService,
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
