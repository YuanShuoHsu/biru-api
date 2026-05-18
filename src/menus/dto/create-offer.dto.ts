import { ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import type { ItemAvailability } from 'src/db/schema/menus';

export class QuantitativeValueDto {
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
  priceValidUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  validThrough?: string;

  @ApiPropertyOptional({ type: QuantitativeValueDto })
  @IsOptional()
  @Type(() => QuantitativeValueDto)
  @ValidateNested()
  eligibleQuantity?: QuantitativeValueDto;

  @ApiPropertyOptional({
    type: QuantitativeValueDto,
    description: '預計準備時間，unitText 建議用 "minute"',
  })
  @IsOptional()
  @Type(() => QuantitativeValueDto)
  @ValidateNested()
  deliveryLeadTime?: QuantitativeValueDto;

  @ApiPropertyOptional({
    type: QuantitativeValueDto,
    description: '當日剩餘庫存數量',
  })
  @IsOptional()
  @Type(() => QuantitativeValueDto)
  @ValidateNested()
  inventoryLevel?: QuantitativeValueDto;
}
