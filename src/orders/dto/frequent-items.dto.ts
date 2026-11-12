import { ApiProperty, OmitType } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { orderModeEnum, type OrderMode } from '../../db/schema/orders.js';

import { CreateOrderItemDto } from './create-order.dto.js';

export class FrequentItemsQueryDto {
  @IsString()
  organizationSlug: string;

  @ApiProperty({ enum: orderModeEnum.enumValues })
  @IsEnum(orderModeEnum.enumValues)
  mode: OrderMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit?: number = 6;
}

export class FrequentItemDto extends OmitType(CreateOrderItemDto, [
  'quantity',
]) {
  customizationChanged: boolean;

  soldOut: boolean;
}
