import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
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

import { Audit } from 'src/common/decorators/audit.decorator';
import { orderStatusEnum, type OrderStatus } from 'src/db/schema/orders';
import { Roles } from 'src/menus/decorators/roles.decorator';

import { AdminOrderBoardColumnDto } from './dto/admin-order-board-response.dto';
import { AdminOrderResponseDto } from './dto/admin-order-response.dto';
import { ApplyTransitionsDto } from './dto/apply-transitions.dto';
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
  ): Promise<{ data: AdminOrderResponseDto[]; total: number }> {
    return this.ordersService.listOrders(organizationSlug, query);
  }

  @Get('board')
  @ApiOperation({ summary: '查詢顧客端取餐號碼牌（公開）' })
  findBoard(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<OrderBoardItemDto[]> {
    return this.ordersService.listPublicBoard(organizationSlug);
  }

  @Get('board/admin')
  @Roles({ order: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢後台訂單看板' })
  findAdminBoard(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<AdminOrderBoardColumnDto[]> {
    return this.ordersService.listAdminBoard(organizationSlug);
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
  @Audit('order', { param: 'orderId' })
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

  @Patch('transitions/:toStatus')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @Audit(
    { resource: 'order', idSource: { body: 'orderIds' } },
    {
      resource: 'userCoupon',
      idSource: { column: 'orderId', body: 'orderIds' },
    },
  )
  @ApiOperation({
    summary:
      '變更訂單狀態，任一筆不可轉換則整批失敗（可用的目標見各訂單的 availableTransitions）',
  })
  applyTransitions(
    @Param('organizationSlug') organizationSlug: string,
    @Param('toStatus', new ParseEnumPipe(orderStatusEnum.enumValues))
    toStatus: OrderStatus,
    @Body() dto: ApplyTransitionsDto,
  ): Promise<AdminOrderResponseDto[]> {
    return this.ordersService.applyTransitions(
      organizationSlug,
      dto.orderIds,
      toStatus,
    );
  }
}
