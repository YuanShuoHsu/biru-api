import { ApiProperty } from '@nestjs/swagger';

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
}
