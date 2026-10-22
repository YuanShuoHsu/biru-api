import { OrderInvoiceDto } from '../orders/dto/order-response.dto.js';

import { OrderInvoicePrintDto } from './dto/order-invoice-print.dto.js';
import { ResetInvoicePrintDto } from './dto/reset-invoice-print.dto.js';
import { VoidInvoiceDto } from './dto/void-invoice.dto.js';
import { OrderInvoiceVerificationDto } from './dto/order-invoice-verification.dto.js';

import { EcpayOrderInvoiceService } from './services/ecpay-order-invoice.service.js';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';
import {
  PrintJobDto,
  ResolvePrintJobDto,
} from '../printers/dto/printer.dto.js';

@ApiTags('orders')
@Controller('organizations/:organizationSlug/orders/:orderId/invoice')
export class EcpayOrderInvoiceController {
  constructor(
    private readonly ecpayOrderInvoiceService: EcpayOrderInvoiceService,
  ) {}

  @Post()
  @Roles({ order: ['update'] }, 'organizationSlug')
  @Audit('invoice', { column: 'orderId', param: 'orderId' })
  @ApiCreatedResponse({ type: OrderInvoiceDto })
  @ApiOperation({ summary: '補開發票（開立失敗後由後台重試）' })
  issue(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderInvoiceDto> {
    return this.ecpayOrderInvoiceService.issueForOrder(
      organizationSlug,
      orderId,
    );
  }

  @Post('print')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @ApiCreatedResponse({ type: OrderInvoicePrintDto })
  @ApiOperation({
    summary:
      '列印發票：有發票印表機時排入印表機佇列，否則回傳列印頁（未印過時給正本，印完須回報 print-jobs/:jobId/confirmation）',
  })
  print(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderInvoicePrintDto> {
    return this.ecpayOrderInvoiceService.getPrintForOrder(
      organizationSlug,
      orderId,
    );
  }

  @Post('print-jobs/:jobId/confirmation')
  @HttpCode(204)
  @Roles({ order: ['update'] }, 'organizationSlug')
  @ApiNoContentResponse()
  @ApiOperation({
    summary: '瀏覽器列印完成後回報，正本之後再印只會是補印聯',
  })
  confirmPrint(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
    @Param('jobId') jobId: string,
  ): Promise<void> {
    return this.ecpayOrderInvoiceService.confirmPrintForOrder(
      organizationSlug,
      orderId,
      jobId,
    );
  }

  @Post('print-jobs/:jobId/cancellation')
  @HttpCode(204)
  @Roles({ order: ['update'] }, 'organizationSlug')
  @ApiNoContentResponse()
  @ApiOperation({
    summary: '取消排隊中、還沒送到印表機的列印工作；之後可再按列印重新排入',
  })
  cancelPrintJob(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
    @Param('jobId') jobId: string,
  ): Promise<void> {
    return this.ecpayOrderInvoiceService.cancelPrintJobForOrder(
      organizationSlug,
      orderId,
      jobId,
    );
  }

  @Post('print-jobs/:jobId/resolution')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @Audit('invoice', { column: 'orderId', param: 'orderId' })
  @ApiCreatedResponse({ type: PrintJobDto })
  @ApiOperation({
    summary: '確認列印結果不明的工作：有印出就結案，沒印出就重新排入佇列',
  })
  resolvePrintJob(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
    @Param('jobId') jobId: string,
    @Body() { printed }: ResolvePrintJobDto,
  ): Promise<PrintJobDto> {
    return this.ecpayOrderInvoiceService.resolvePrintJobForOrder(
      organizationSlug,
      orderId,
      jobId,
      printed,
    );
  }

  @Get('verification')
  @Roles({ order: ['read'] }, 'organizationSlug')
  @ApiOkResponse({ type: OrderInvoiceVerificationDto })
  @ApiOperation({ summary: '向綠界查證發票狀態' })
  verify(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderInvoiceVerificationDto> {
    return this.ecpayOrderInvoiceService.verifyForOrder(
      organizationSlug,
      orderId,
    );
  }

  @Post('void')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @Audit('invoice', { column: 'orderId', param: 'orderId' })
  @ApiCreatedResponse({ type: OrderInvoiceDto })
  @ApiOperation({
    summary: '作廢發票並重新開立（統編或抬頭開錯但不需退款時），回傳新的發票',
  })
  void(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
    @Body() dto: VoidInvoiceDto,
  ): Promise<OrderInvoiceDto> {
    return this.ecpayOrderInvoiceService.voidForOrder(
      organizationSlug,
      orderId,
      dto,
    );
  }

  @Patch('print')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @Audit('invoice', { column: 'orderId', param: 'orderId' })
  @ApiOkResponse({ type: OrderInvoiceDto })
  @ApiOperation({ summary: '清除列印紀錄（紙沒印出來時還原正本）' })
  resetPrint(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
    @Body() { reason }: ResetInvoicePrintDto,
  ): Promise<OrderInvoiceDto> {
    return this.ecpayOrderInvoiceService.resetPrintForOrder(
      organizationSlug,
      orderId,
      reason,
    );
  }
}
