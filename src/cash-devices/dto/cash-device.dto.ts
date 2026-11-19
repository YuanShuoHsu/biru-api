import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { trim } from '../../common/utils/trim.js';
import {
  cashDeviceStatusEnum,
  type CashDeviceStatus,
} from '../../db/schema/cash-devices.js';

export class CreateCashDeviceDto {
  @ApiProperty({ example: '櫃台自助繳費機' })
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  vendor?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  model?: string | null;

  @ApiPropertyOptional({
    enum: cashDeviceStatusEnum.enumValues,
    enumName: 'CashDeviceStatus',
  })
  @IsOptional()
  @IsIn(cashDeviceStatusEnum.enumValues)
  status?: CashDeviceStatus;
}

export class UpdateCashDeviceDto extends PartialType(CreateCashDeviceDto, {
  skipNullProperties: false,
}) {}

export class CashDeviceResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true, type: String }) vendor: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) model: string | null;
  @ApiProperty({
    enum: cashDeviceStatusEnum.enumValues,
    enumName: 'CashDeviceStatus',
  })
  status: CashDeviceStatus;
  @ApiPropertyOptional({ nullable: true, type: Date })
  lastSeenAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class CashDeviceListResponseDto {
  @ApiProperty({ type: [CashDeviceResponseDto] }) data: CashDeviceResponseDto[];
  @ApiProperty() total: number;
}
