import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { orderModeEnum, type OrderMode } from '../../db/schema/orders.js';

import { CreateOrderItemDto } from '../../orders/dto/create-order.dto.js';

export class ValidateCouponDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  code: string;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiProperty({ enum: orderModeEnum.enumValues })
  @IsEnum(orderModeEnum.enumValues)
  mode: OrderMode;
}

export class ValidateCouponResponseDto {
  @ApiProperty() code: string;
  @ApiProperty() discount: string;
  @ApiProperty() subtotal: string;
  @ApiProperty() total: string;
}
