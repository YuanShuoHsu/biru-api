import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { UpdateItemAvailabilityDto } from './update-item-availability.dto.js';

export class OfferInventoryLevelValueDto {
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
}
