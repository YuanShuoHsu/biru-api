import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  ValidateNested,
} from 'class-validator';
import { orderModeEnum, type OrderMode } from 'src/db/schema/orders';

import { CreateOrderItemDto } from '../../orders/dto/create-order.dto';

export class ValidateCouponDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
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
