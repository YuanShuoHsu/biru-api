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

export class CheckoutEcpayResponseDto {
  @ApiProperty({ description: '綠界結帳端點，前端以 hidden form POST 導向' })
  action: string;

  @ApiProperty({
    additionalProperties: { type: 'string' },
    description: '表單欄位（含 CheckMacValue），逐一放入 hidden input',
    type: 'object',
  })
  fields: Record<string, string>;
}
