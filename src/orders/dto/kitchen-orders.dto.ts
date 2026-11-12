import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';

import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { AdminOrderResponseDto } from './admin-order-response.dto.js';
import { OrderItemResponseDto } from './order-response.dto.js';

export class KitchenOrdersQueryDto {
  @ApiPropertyOptional({
    description: '只列這台工作單印表機負責的品項，沒有品項的訂單不列',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  printerId?: string;
}

export class KitchenOrderItemDto extends OrderItemResponseDto {
  @ApiProperty({ description: '已退款的數量，等於點餐數量時不必製作' })
  refundedQuantity: number;
}

export class KitchenOrderResponseDto extends OmitType(AdminOrderResponseDto, [
  'items',
] as const) {
  @ApiProperty({ type: [KitchenOrderItemDto] })
  items: KitchenOrderItemDto[];
}
