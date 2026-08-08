import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { orderStatusEnum, type OrderStatus } from 'src/db/schema/orders';

import {
  ORDER_TRANSITION_DIRECTIONS,
  type OrderTransitionDirection,
} from '../order-transitions';

export class OrderTransitionDto {
  @ApiPropertyOptional({
    description: '此轉換僅適用現金訂單，動作實際上是收款或取消收款',
  })
  cashOnly?: boolean;

  @ApiProperty({
    enum: ORDER_TRANSITION_DIRECTIONS,
    enumName: 'OrderTransitionDirection',
  })
  direction: OrderTransitionDirection;

  @ApiProperty({ enum: orderStatusEnum.enumValues, enumName: 'OrderStatus' })
  toStatus: OrderStatus;
}
