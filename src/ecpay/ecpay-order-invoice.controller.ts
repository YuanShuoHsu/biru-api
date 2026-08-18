import { OrderInvoiceDto } from '../orders/dto/order-response.dto';

import { OrderInvoicePrintDto } from './dto/order-invoice-print.dto';

import { EcpayOrderInvoiceService } from './services/ecpay-order-invoice.service';

import { Controller, Param, Patch, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/menus/decorators/roles.decorator';

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
  @ApiOperation({ summary: '取得發票列印網址（熱感應紙，1 小時內有效）' })
  print(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderInvoicePrintDto> {
    return this.ecpayOrderInvoiceService.getPrintForOrder(
      organizationSlug,
      orderId,
    );
  }

  // 稽核把 DELETE 一律記成整列被刪，用 PATCH 才會記成 printedAt 被清空
  @Patch('print')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @Audit('invoice', { column: 'orderId', param: 'orderId' })
  @ApiOkResponse({ type: OrderInvoiceDto })
  @ApiOperation({ summary: '清除列印紀錄（紙沒印出來時還原正本）' })
  resetPrint(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderInvoiceDto> {
    return this.ecpayOrderInvoiceService.resetPrintForOrder(
      organizationSlug,
      orderId,
    );
  }
}
