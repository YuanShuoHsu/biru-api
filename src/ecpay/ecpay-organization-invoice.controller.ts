import { UnprintedInvoiceDto } from './dto/unprinted-invoice.dto.js';

import { EcpayOrderInvoiceService } from './services/ecpay-order-invoice.service.js';

import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../menus/decorators/roles.decorator.js';

@ApiTags('orders')
@Controller('organizations/:organizationSlug/invoices')
export class EcpayOrganizationInvoiceController {
  constructor(
    private readonly ecpayOrderInvoiceService: EcpayOrderInvoiceService,
  ) {}

  @Get('unprinted')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @ApiOkResponse({ type: [UnprintedInvoiceDto] })
  @ApiOperation({
    summary: '今天開立、可列印但尚未印過的發票（自動列印補印用）',
  })
  listUnprinted(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<UnprintedInvoiceDto[]> {
    return this.ecpayOrderInvoiceService.listUnprintedToday(organizationSlug);
  }
}
