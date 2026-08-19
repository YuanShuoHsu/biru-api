import { CreateOrderRefundDto, OrderRefundDto } from './dto/order-refund.dto';

import { EcpayOrderRefundService } from './services/ecpay-order-refund.service';

import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { Audit } from 'src/common/decorators/audit.decorator';
import { Roles } from 'src/menus/decorators/roles.decorator';

@ApiTags('orders')
@Controller('organizations/:organizationSlug/orders/:orderId/refunds')
export class EcpayOrderRefundController {
  constructor(
    private readonly ecpayOrderRefundService: EcpayOrderRefundService,
  ) {}

  @Get()
  @Roles({ order: ['read'] }, 'organizationSlug')
  @ApiOkResponse({ type: [OrderRefundDto] })
  @ApiOperation({ summary: '查詢訂單的退款紀錄' })
  findAll(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderRefundDto[]> {
    return this.ecpayOrderRefundService.findByOrder(organizationSlug, orderId);
  }

  @Post()
  @Roles({ order: ['update'] }, 'organizationSlug')
  @Audit('order', { param: 'orderId' })
  @ApiCreatedResponse({ type: OrderRefundDto })
  @ApiOperation({
    summary:
      '退款（省略 items 為整單全額退）；非信用卡付款方式僅登錄，需另至綠界後台或直接退現',
  })
  refund(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
    @Body() dto: CreateOrderRefundDto,
    @Session() session: UserSession | null,
  ): Promise<OrderRefundDto> {
    return this.ecpayOrderRefundService.refundOrder(
      organizationSlug,
      orderId,
      dto,
      session?.user.id,
    );
  }
}
