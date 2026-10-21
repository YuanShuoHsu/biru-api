import { ApiProperty } from '@nestjs/swagger';

import {
  ORDER_FLOW_STATUSES,
  type OrderFlowStatus,
} from '../../db/schema/orders.js';

import { AdminOrderResponseDto } from './admin-order-response.dto.js';

export class AdminOrderBoardColumnDto {
  @ApiProperty({ enum: ORDER_FLOW_STATUSES, enumName: 'OrderFlowStatus' })
  orderStatus: OrderFlowStatus;

  @ApiProperty({ isArray: true, type: AdminOrderResponseDto })
  orders: AdminOrderResponseDto[];
}
