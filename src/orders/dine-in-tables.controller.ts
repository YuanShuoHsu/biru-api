import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../menus/decorators/roles.decorator.js';

import { DineInTableTokenResponseDto } from './dto/dine-in-table-token.dto.js';
import { OrderQrService } from './order-qr.service.js';

@ApiTags('orders')
@Controller('organizations/:organizationSlug/dine-in-tables')
export class DineInTablesController {
  constructor(private readonly orderQrService: OrderQrService) {}

  @Get(':tableNumber/token')
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '產生桌上 QR code 的桌號簽章' })
  findToken(
    @Param('organizationSlug') organizationSlug: string,
    @Param('tableNumber', ParseIntPipe) tableNumber: number,
  ): Promise<DineInTableTokenResponseDto> {
    return this.orderQrService.getDineInTableToken(
      organizationSlug,
      tableNumber,
    );
  }
}
