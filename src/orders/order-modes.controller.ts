import { Controller, Get, Param, ParseEnumPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../menus/decorators/roles.decorator.js';

import { OrderModeTokenResponseDto } from './dto/order-mode-token.dto.js';
import {
  modeTokenOrderModes,
  type ModeTokenOrderMode,
} from './order-qr-token.js';
import { OrdersService } from './orders.service.js';

@ApiTags('orders')
@Controller('organizations/:organizationSlug/order-modes')
export class OrderModesController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get(':mode/token')
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '產生櫃台／得來速 QR code 的點餐方式簽章' })
  findToken(
    @Param('organizationSlug') organizationSlug: string,
    @Param('mode', new ParseEnumPipe(modeTokenOrderModes))
    mode: ModeTokenOrderMode,
  ): Promise<OrderModeTokenResponseDto> {
    return this.ordersService.getOrderModeToken(organizationSlug, mode);
  }
}
