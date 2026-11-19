import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';

import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { trim } from '../../common/utils/trim.js';
import {
  cashDeviceEventTypeEnum,
  type CashDeviceEventType,
} from '../../db/schema/cash-devices.js';

const MAX_COUNT = 9999;
const MAX_AMOUNT = 9_999_999;

export class CashDenominationsDto {
  @IsOptional() @IsInt() @Min(0) @Max(MAX_COUNT) '1'?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_COUNT) '5'?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_COUNT) '10'?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_COUNT) '20'?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_COUNT) '50'?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_COUNT) '100'?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_COUNT) '200'?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_COUNT) '500'?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_COUNT) '1000'?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_COUNT) '2000'?: number;
}

class CashDeviceEventInputDto {
  @ApiProperty({ description: '開啟表單時產生，重試時沿用' })
  @IsUUID()
  idempotencyKey: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(500)
  note?: string | null;
}

export class CreateCashDeviceRefillDto extends CashDeviceEventInputDto {
  @ApiProperty({ description: '面額 → 張（枚）數；金額由此算出' })
  @IsObject()
  @ValidateNested()
  @Type(() => CashDenominationsDto)
  denominations: CashDenominationsDto;
}

export class CreateCashDeviceCollectionDto extends CashDeviceEventInputDto {
  @ApiProperty({ description: '機台回報的金額' })
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT)
  reportedAmount: number;

  @ApiProperty({ description: '實際存入的金額' })
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT)
  depositedAmount: number;
}

export class CashDeviceEventQueryDto extends PickType(PaginationQueryDto, [
  'limit',
  'offset',
] as const) {}

export class CashDeviceEventResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() deviceId: string;
  @ApiProperty({
    enum: cashDeviceEventTypeEnum.enumValues,
    enumName: 'CashDeviceEventType',
  })
  type: CashDeviceEventType;
  @ApiProperty() idempotencyKey: string;
  @ApiProperty({ type: CashDenominationsDto })
  denominations: CashDenominationsDto;
  @ApiPropertyOptional({ nullable: true, type: String }) amount: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  reportedAmount: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  depositedAmount: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: '實際存入減機台回報；只有收鈔有',
  })
  difference: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) note: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  createdBy: string | null;
  @ApiProperty() occurredAt: Date;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class CashDeviceEventListResponseDto {
  @ApiProperty({ type: [CashDeviceEventResponseDto] })
  data: CashDeviceEventResponseDto[];
  @ApiProperty() total: number;
}
