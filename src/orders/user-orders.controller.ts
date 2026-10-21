import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { UserOrderListResponseDto } from './dto/order-response.dto.js';
import { UserOrderPaginationQueryDto } from './dto/user-order-pagination-query.dto.js';
import { OrdersService } from './orders.service.js';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('users/me/orders')
export class UserOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOkResponse({ type: UserOrderListResponseDto })
  @ApiOperation({ summary: '查詢我的訂單列表' })
  findAll(
    @Query() query: UserOrderPaginationQueryDto,
    @Session() session: UserSession,
  ): Promise<UserOrderListResponseDto> {
    return this.ordersService.listUserOrders(session.user.id, query);
  }
}
