import { ApiProperty, PickType } from '@nestjs/swagger';

import { CreateOrderDto } from './create-order.dto.js';

export class ExpectedPointsDto extends PickType(CreateOrderDto, [
  'discountCode',
  'items',
  'mode',
] as const) {}

export class ExpectedPointsResponseDto {
  @ApiProperty({
    description:
      '登入會員下這張單可得的點數，與實際入點同一算法，依目前點數設定與優惠折抵後金額計算；點數未啟用時為 null',
    nullable: true,
    type: Number,
  })
  expectedPoints: number | null;
}
