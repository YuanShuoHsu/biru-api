import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import type { Request, Response } from 'express';

import { ANONYMOUS_THROTTLER } from '../common/constants/throttle.js';
import { Audit } from '../common/decorators/audit.decorator.js';
import { orderStatusEnum, type OrderStatus } from '../db/schema/orders.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import { AdminOrderBoardColumnDto } from './dto/admin-order-board-response.dto.js';
import { AdminOrderResponseDto } from './dto/admin-order-response.dto.js';
import { ApplyTransitionsDto } from './dto/apply-transitions.dto.js';
import {
  CreateOrderCustomerDto,
  CreateOrderDto,
} from './dto/create-order.dto.js';
import { OrderBoardItemDto } from './dto/order-board-response.dto.js';
import { OrderPaginationQueryDto } from './dto/order-pagination-query.dto.js';
import {
  PrepEstimateResponseDto,
  PrepTimeResponseDto,
} from './dto/prep-estimate-response.dto.js';
import {
  CreateOrderResponseDto,
  OrderReceiptResponseDto,
  OrderResponseDto,
} from './dto/order-response.dto.js';
import { orderAccessToken } from './order-access-token.js';
import {
  ORDER_QR_SESSION_COOKIE,
  setOrderQrSessionCookie,
} from './order-qr-token.js';
import { OrderQrService } from './order-qr.service.js';
import { OrdersService } from './orders.service.js';
import { PrepEstimateService } from './prep-estimate.service.js';

@AllowAnonymous()
@ApiTags('orders')
@Controller('organizations/:organizationSlug/orders')
export class OrdersController {
  constructor(
    private readonly orderQrService: OrderQrService,
    private readonly ordersService: OrdersService,
    private readonly prepEstimateService: PrepEstimateService,
  ) {}

  @Post()
  @Throttle({ [ANONYMOUS_THROTTLER]: { limit: 10, ttl: minutes(1) } })
  @ApiHeader({
    description: '同一次結帳重試請帶同一把鍵，重送會回傳既有訂單',
    name: 'Idempotency-Key',
    required: false,
  })
  @ApiOperation({ summary: '建立訂單' })
  async create(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Session() session: UserSession | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreateOrderResponseDto> {
    const qrSessionValue = req.cookies?.[ORDER_QR_SESSION_COOKIE] as
      string | undefined;

    const created = await this.ordersService.createOrder(
      organizationSlug,
      dto,
      session?.user.id || null,
      idempotencyKey || null,
      qrSessionValue,
    );

    const renewed = await this.orderQrService.renewSession(
      organizationSlug,
      qrSessionValue,
      dto.mode,
    );
    if (renewed) setOrderQrSessionCookie(res, renewed);

    return { ...created, accessToken: orderAccessToken(created.id) };
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

  @Get('prep-estimate')
  @ApiOperation({ summary: '查詢目前出餐約需幾分鐘（公開）' })
  findPrepEstimate(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<PrepEstimateResponseDto> {
    return this.prepEstimateService.findBySlug(organizationSlug);
  }

  @Get('prep-times')
  @Roles({ order: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢各品項設定的備餐時間與近 14 天實際平均' })
  findPrepTimes(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<PrepTimeResponseDto[]> {
    return this.prepEstimateService.findPrepTimesBySlug(organizationSlug);
  }

  @Get(':orderId')
  @ApiOperation({ summary: '查詢訂單' })
  @ApiQuery({ name: 'accessToken', required: false, type: String })
  findOne(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
    @Query('accessToken') accessToken: string | undefined,
    @Session() session: UserSession | null,
  ): Promise<OrderReceiptResponseDto> {
    return this.ordersService.getOrder(
      organizationSlug,
      orderId,
      session?.user ?? null,
      accessToken || null,
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
