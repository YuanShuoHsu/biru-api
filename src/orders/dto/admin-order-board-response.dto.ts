import { ApiProperty } from '@nestjs/swagger';

import {
  ORDER_FLOW_STATUSES,
  type OrderFlowStatus,
} from 'src/db/schema/orders';

import { OrderResponseDto } from './order-response.dto';

export const ADMIN_BOARD_COLUMN_LIMIT = 100;

export class AdminOrderBoardColumnDto {
  @ApiProperty({ enum: ORDER_FLOW_STATUSES, enumName: 'OrderFlowStatus' })
  orderStatus: OrderFlowStatus;

  @ApiProperty({ isArray: true, type: OrderResponseDto })
  orders: OrderResponseDto[];
}
