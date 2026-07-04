import { IsDefined, IsNotEmpty, IsString } from 'class-validator';

import { ApiProperty, PickType } from '@nestjs/swagger';

import { BaseEcpayDto } from './base-ecpay.dto';

export class CheckoutEcpayDto extends PickType(BaseEcpayDto, [
  'ClientBackURL',
  'ItemName',
  'Language',
  'OrderResultURL',
  'TradeDesc',
] as const) {
  @ApiProperty({ description: '訂單 ID' })
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  orderId: string;
}
