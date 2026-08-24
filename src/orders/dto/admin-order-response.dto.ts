import { ApiProperty } from '@nestjs/swagger';

import type { RefundChannel } from 'src/db/schema/refunds';

import { OrderResponseDto } from './order-response.dto';
import { OrderTransitionDto } from './order-transition.dto';

export class AdminOrderResponseDto extends OrderResponseDto {
  @ApiProperty({ isArray: true, type: OrderTransitionDto })
  availableTransitions: OrderTransitionDto[];

  @ApiProperty({
    description:
      '是否可退款；退款不走 transitions，須呼叫 orders/{orderId}/refunds',
  })
  refundable: boolean;

  @ApiProperty({
    description:
      'ecpay：可直接透過綠界退刷；manual：綠界不支援此付款方式的退款 API，系統僅登錄，需店家自行退款',
    enum: ['ecpay', 'manual'],
    enumName: 'RefundChannel',
  })
  refundChannel: RefundChannel;
}
