import { ApiProperty } from '@nestjs/swagger';

import type { OrderStatus } from 'src/db/schema/orders';

export const ORDER_BOARD_STATUSES = [
  'OrderPaymentDue',
  'OrderProcessing',
  'OrderPickupAvailable',
] as const satisfies readonly OrderStatus[];

export type OrderBoardStatus = (typeof ORDER_BOARD_STATUSES)[number];

export class OrderBoardItemDto {
  @ApiProperty() orderNumber: string;
  @ApiProperty({ enum: ORDER_BOARD_STATUSES, enumName: 'OrderBoardStatus' })
  orderStatus: OrderBoardStatus;
}
