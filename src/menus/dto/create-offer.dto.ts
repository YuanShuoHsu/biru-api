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

export class UnitPriceSpecificationDto {
  @ApiPropertyOptional({ example: '150.00' })
  @IsString()
  price: string;

  @ApiPropertyOptional({ example: 'TWD' })
  @IsString()
  priceCurrency: string;

  @ApiPropertyOptional({
    example: '2025-06-01T00:00:00+08:00',
    description: '促銷開始時間（ISO 8601）',
  })
  @IsOptional()
  @IsString()
  validFrom?: string;

  @ApiPropertyOptional({
    example: '2025-06-30T23:59:59+08:00',
    description: '促銷結束時間（ISO 8601）',
  })
  @IsOptional()
  @IsString()
  validThrough?: string;
}

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

  @ApiPropertyOptional({ type: [UnitPriceSpecificationDto] })
  @IsOptional()
  @IsArray()
  @Type(() => UnitPriceSpecificationDto)
  @ValidateNested({ each: true })
  priceSpecification?: UnitPriceSpecificationDto[];
}
