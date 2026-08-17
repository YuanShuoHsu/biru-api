import { OrderInvoiceDto } from '../orders/dto/order-response.dto';

import { EcpayOrderInvoiceService } from './services/ecpay-order-invoice.service';

import { Controller, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from 'src/menus/decorators/roles.decorator';

@ApiTags('orders')
@Controller('organizations/:organizationSlug/orders/:orderId/invoice')
export class EcpayOrderInvoiceController {
  constructor(
    private readonly ecpayOrderInvoiceService: EcpayOrderInvoiceService,
  ) {}

  @Post()
  @Roles({ order: ['update'] }, 'organizationSlug')
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
}
