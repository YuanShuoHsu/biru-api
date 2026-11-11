import { ApiProperty, PickType } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';

import { CreateOrderDto, CreateOrderItemDto } from './create-order.dto.js';

export class ExpectedPointsDto extends PickType(CreateOrderDto, [
  'discountCode',
  'mode',
] as const) {
  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

export class ExpectedPointsResponseDto {
  @ApiProperty({
    description:
      '登入會員下這張單可得的點數，與實際入點同一算法，依目前點數設定與優惠折抵後金額計算；點數未啟用時為 null',
    nullable: true,
    type: Number,
  })
  expectedPoints: number | null;
}
