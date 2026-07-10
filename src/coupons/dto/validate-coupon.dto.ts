import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  ValidateNested,
} from 'class-validator';

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
}

export class ValidateCouponResponseDto {
  @ApiProperty() code: string;
  @ApiProperty() discount: string;
  @ApiProperty() subtotal: string;
  @ApiProperty() total: string;
}
