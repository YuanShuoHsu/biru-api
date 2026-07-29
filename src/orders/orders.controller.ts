import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';

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
    @Session() session: UserSession | null,
  ): Promise<OrderResponseDto> {
    return this.ordersService.createOrder(
      organizationSlug,
      dto,
      session?.user.id || null,
    );
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
    @Session() session: UserSession | null,
  ): Promise<OrderResponseDto> {
    return this.ordersService.getOrder(
      organizationSlug,
      orderId,
      session?.user.id || null,
    );
  }

  @Patch(':orderId/ready')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '標記訂單可取餐' })
  markReady(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.markOrderReady(organizationSlug, orderId);
  }

  @Patch(':orderId/picked-up')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '確認已取餐' })
  confirmPickup(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.confirmPickup(organizationSlug, orderId);
  }

  @Patch(':orderId/processing')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @ApiOperation({
    summary: '取消標記完成（退回上一個狀態：已送達→可取餐、可取餐→準備中）',
  })
  revertReady(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.revertOrderReady(organizationSlug, orderId);
  }
}
