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
  RefundScope,
  RefundStatus,
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

export class RefundItemSnapshotDto {
  @ApiProperty({ description: '訂單品項 ID' })
  orderItemId: string;

  @ApiProperty({ description: '品項名稱' })
  menuItemName: string;

  @ApiProperty({ description: '退款數量' })
  quantity: number;

  @ApiProperty({ description: '單價' })
  unitPrice: string;

  @ApiProperty({ description: '此品項的退款金額' })
  amount: string;
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

  @ApiProperty({
    description: '此次退款的品項與數量',
    nullable: true,
    type: [RefundItemSnapshotDto],
  })
  items: RefundItemSnapshotDto[] | null;

  @ApiProperty({
    description:
      'pending：錢動了沒尚未確認；refunded：款項已退，後續處理未完成；settled：發票、點數、優惠券與訂單狀態都已處理完',
    enum: ['pending', 'refunded', 'settled'],
    enumName: 'RefundStatus',
  })
  status: RefundStatus;

  @ApiProperty({
    description:
      'null：發票尚未處理；none：無發票需處理；voided：發票已作廢；allowance：已開立折讓；failed：錢已退但發票處理失敗',
    enum: ['none', 'voided', 'allowance', 'failed'],
    enumName: 'RefundInvoiceAction',
    nullable: true,
  })
  invoiceAction: RefundInvoiceAction | null;

  @ApiProperty({ description: '發票處理失敗的原因', nullable: true })
  invoiceError: string | null;

  @ApiProperty({ description: '綠界折讓單號', nullable: true })
  allowanceNo: string | null;

  @ApiProperty({ description: '退款原因', nullable: true })
  reason: string | null;

  @ApiProperty({ description: '建立時間' })
  createdAt: Date;
}
