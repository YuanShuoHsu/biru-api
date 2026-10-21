import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../menus/decorators/roles.decorator.js';

import { DineInTableTokenResponseDto } from './dto/dine-in-table-token.dto.js';
import { OrdersService } from './orders.service.js';

@ApiTags('orders')
@Controller('organizations/:organizationSlug/dine-in-tables')
export class DineInTablesController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get(':tableNumber/token')
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '產生桌上 QR code 的桌號簽章' })
  findToken(
    @Param('organizationSlug') organizationSlug: string,
    @Param('tableNumber', ParseIntPipe) tableNumber: number,
  ): Promise<DineInTableTokenResponseDto> {
    return this.ordersService.getDineInTableToken(
      organizationSlug,
      tableNumber,
    );
  }
}
