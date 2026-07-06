import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { Roles } from 'src/menus/decorators/roles.decorator';

import { CreateOrderDto } from './dto/create-order.dto';
import { OrderPaginationQueryDto } from './dto/order-pagination-query.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@AllowAnonymous()
@ApiTags('orders')
@Controller('organizations/:organizationSlug/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: '建立訂單' })
  create(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.createOrder(organizationSlug, dto);
  }

  @Get()
  @Roles({ order: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢訂單列表' })
  findAll(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: OrderPaginationQueryDto,
  ): Promise<{ data: OrderResponseDto[]; total: number }> {
    return this.ordersService.listOrders(organizationSlug, query);
  }

  @Get(':orderId')
  @ApiOperation({ summary: '查詢訂單' })
  findOne(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.getOrder(organizationSlug, orderId);
  }
}
