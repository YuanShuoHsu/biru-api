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

import { CreateOrderCustomerDto, CreateOrderDto } from './dto/create-order.dto';
import { OrderBoardItemDto } from './dto/order-board-response.dto';
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

  @Get('board')
  @ApiOperation({ summary: '查詢顧客端取餐號碼牌（公開）' })
  findBoard(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<OrderBoardItemDto[]> {
    return this.ordersService.listPublicBoard(organizationSlug);
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

  @Patch(':orderId/customer')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '修改顧客資訊' })
  updateCustomer(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
    @Body() dto: CreateOrderCustomerDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.updateOrderCustomer(
      organizationSlug,
      orderId,
      dto,
    );
  }

  @Patch(':orderId/cancel')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '取消訂單（限未付款）' })
  cancel(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.cancelUnpaidOrder(organizationSlug, orderId);
  }

  @Patch(':orderId/paid')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '確認現金已收款' })
  markCashPaid(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.markCashPaid(organizationSlug, orderId);
  }

  @Patch(':orderId/unpaid')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '撤銷現金收款（退回待付款）' })
  revertCashPaid(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.revertCashPaid(organizationSlug, orderId);
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
