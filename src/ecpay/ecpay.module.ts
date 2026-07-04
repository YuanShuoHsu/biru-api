import { EcpayController } from './ecpay.controller';

import { EcpayAddInvoiceWordSettingService } from './services/ecpay-add-invoice-word-setting.service';
import { EcpayBaseService } from './services/ecpay-base.service';
import { EcpayGetGovInvoiceWordSettingService } from './services/ecpay-get-gov-invoice-word-setting.service';
import { EcpayGetInvoiceWordSettingService } from './services/ecpay-get-invoice-word-setting.service';
import { EcpayIssueInvoiceService } from './services/ecpay-issue-invoice.service';
import { EcpayUpdateInvoiceWordStatusService } from './services/ecpay-update-invoice-word-status.service';

import { OrdersModule } from '../orders/orders.module';

import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  imports: [HttpModule, OrdersModule],
  controllers: [EcpayController],
  providers: [
    EcpayBaseService,
    EcpayGetGovInvoiceWordSettingService,
    EcpayGetInvoiceWordSettingService,
    EcpayAddInvoiceWordSettingService,
    EcpayUpdateInvoiceWordStatusService,
    EcpayIssueInvoiceService,
  ],
})
export class EcpayModule {}
