import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  orderModeEnum,
  type OrderMode,
  type OrderStatus,
} from 'src/db/schema/orders';

export const ORDER_BOARD_STATUSES = [
  'OrderPaymentDue',
  'OrderProcessing',
  'OrderPickupAvailable',
] as const satisfies readonly OrderStatus[];

export type OrderBoardStatus = (typeof ORDER_BOARD_STATUSES)[number];

export class OrderBoardItemDto {
  @ApiProperty() orderId: string;
  @ApiProperty() orderNumber: string;
  @ApiProperty({ enum: ORDER_BOARD_STATUSES, enumName: 'OrderBoardStatus' })
  orderStatus: OrderBoardStatus;
  @ApiProperty({ enum: orderModeEnum.enumValues }) mode: OrderMode;
  @ApiPropertyOptional() pickupTime?: Date | null;
  @ApiPropertyOptional() tableNumber?: number | null;
}
