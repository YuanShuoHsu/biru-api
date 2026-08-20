import { OrderPaymentNotificationDto } from './dto/order-payment-notification.dto';

import { EcpayCallbackLogService } from './services/ecpay-callback-log.service';

import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from 'src/menus/decorators/roles.decorator';

@ApiTags('orders')
@Controller(
  'organizations/:organizationSlug/orders/:orderId/payment-notifications',
)
export class EcpayOrderPaymentNotificationController {
  constructor(
    private readonly ecpayCallbackLogService: EcpayCallbackLogService,
  ) {}

  @Get()
  @Roles({ order: ['read'] }, 'organizationSlug')
  @ApiOkResponse({ type: [OrderPaymentNotificationDto] })
  @ApiOperation({
    summary: '查詢訂單的綠界付款通知與查證紀錄（付款狀態對不起來時的追查依據）',
  })
  findAll(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
  ): Promise<OrderPaymentNotificationDto[]> {
    return this.ecpayCallbackLogService.findByOrder(organizationSlug, orderId);
  }
}
