import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { EligibleQuantityDto } from './create-offer.dto.js';
import { UpdateItemAvailabilityDto } from './update-item-availability.dto.js';

class OfferInventoryLevelValueDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: '當日剩餘庫存數量；null 代表不限量',
  })
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  value: number | null;
}

export class UpdateOfferAvailabilityDto extends UpdateItemAvailabilityDto {
  @ApiPropertyOptional({
    type: OfferInventoryLevelValueDto,
    description: '僅含數量；單位 unitText 屬菜單定義，需 menu:update 才能改',
  })
  @IsOptional()
  @Type(() => OfferInventoryLevelValueDto)
  @ValidateNested()
  inventoryLevel?: OfferInventoryLevelValueDto;

  @ApiPropertyOptional({
    description:
      '每日限量；每天 04:00（台灣時間）把剩餘數量恢復為此數。null 代表非每日限量；需 menu:update 才能改',
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  dailyLimit?: number | null;

  @ApiPropertyOptional({
    type: EligibleQuantityDto,
    description:
      '限購；只有設了每日限量才可設，且不得大於每日限量。null 代表不限購；需 menu:update 才能改',
    nullable: true,
  })
  @IsOptional()
  @Type(() => EligibleQuantityDto)
  @ValidateNested()
  eligibleQuantity?: EligibleQuantityDto | null;
}
