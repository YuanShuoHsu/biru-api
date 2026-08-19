import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  RefundChannel,
  RefundInvoiceAction,
  RefundItemSnapshot,
  RefundScope,
} from 'src/db/schema/refunds';

export class RefundItemInputDto {
  @ApiProperty({ description: '訂單品項 ID' })
  @IsDefined()
  @IsString()
  orderItemId: string;

  @ApiProperty({ description: '退款數量', example: 1, minimum: 1 })
  @IsDefined()
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderRefundDto {
  @ApiPropertyOptional({
    description:
      '退款品項與數量；省略代表整單全額退款。金額由後端依原單價計算，不接受自訂金額，否則湊不出合法的發票折讓明細',
    type: [RefundItemInputDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RefundItemInputDto)
  items?: RefundItemInputDto[];

  @ApiPropertyOptional({ description: '退款原因', maxLength: 50 })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  reason?: string;
}

export class OrderRefundDto {
  @ApiProperty({ description: '退款 ID' })
  id: string;

  @ApiProperty({ description: '退款金額' })
  amount: string;

  @ApiProperty({
    description: 'full：整單退款；partial：部分品項退款',
    enum: ['full', 'partial'],
  })
  scope: RefundScope;

  @ApiProperty({
    description:
      'ecpay：已透過綠界退刷；manual：綠界不支援此付款方式的退款 API，需店家自行退款，系統僅登錄',
    enum: ['ecpay', 'manual'],
  })
  channel: RefundChannel;

  @ApiProperty({ description: '退款品項；整單退款為 null', nullable: true })
  items: RefundItemSnapshot[] | null;

  @ApiProperty({
    description:
      'none：無發票需處理；voided：發票已作廢；allowance：已開立折讓；failed：錢已退但發票處理失敗',
    enum: ['none', 'voided', 'allowance', 'failed'],
  })
  invoiceAction: RefundInvoiceAction;

  @ApiProperty({ description: '發票處理失敗的原因', nullable: true })
  invoiceError: string | null;

  @ApiProperty({ description: '退款原因', nullable: true })
  reason: string | null;

  @ApiProperty({ description: '建立時間' })
  createdAt: Date;
}
