import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import type { ItemAvailability } from 'src/db/schema/menus';

export class EligibleQuantityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minValue?: number;

  @ApiPropertyOptional({
    description: 'UN/CEFACT Common Code, e.g. "C62" for piece',
  })
  @IsOptional()
  @IsString()
  unitCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unitText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  value?: number;
}

const ITEM_AVAILABILITY_VALUES: ItemAvailability[] = [
  'BackOrder',
  'Discontinued',
  'InStock',
  'InStoreOnly',
  'LimitedAvailability',
  'MadeToOrder',
  'OnlineOnly',
  'OutOfStock',
  'PreOrder',
  'PreSale',
  'Reserved',
  'SoldOut',
];

export class CreateOfferDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '150.00' })
  @IsOptional()
  @IsString()
  price?: string;

  @ApiPropertyOptional({ default: 'TWD' })
  @IsOptional()
  @IsString()
  priceCurrency?: string;

  @ApiPropertyOptional({ enum: ITEM_AVAILABILITY_VALUES })
  @IsOptional()
  @IsEnum(ITEM_AVAILABILITY_VALUES)
  availability?: ItemAvailability;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  availabilityStarts?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  availabilityEnds?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priceValidUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  validThrough?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ type: EligibleQuantityDto })
  @IsOptional()
  @Type(() => EligibleQuantityDto)
  @ValidateNested()
  eligibleQuantity?: EligibleQuantityDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleRegion?: string[];
}
