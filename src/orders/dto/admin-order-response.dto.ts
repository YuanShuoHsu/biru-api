import { ApiProperty } from '@nestjs/swagger';

import { OrderResponseDto } from './order-response.dto';
import { OrderTransitionDto } from './order-transition.dto';

export class AdminOrderResponseDto extends OrderResponseDto {
  @ApiProperty({ isArray: true, type: OrderTransitionDto })
  availableTransitions: OrderTransitionDto[];
}
