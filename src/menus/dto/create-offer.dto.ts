import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import type { ItemAvailability } from 'src/db/schema/menus';

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
  @ApiPropertyOptional({ description: 'MenuItem this offer belongs to' })
  @IsOptional()
  @IsString()
  menuItemId?: string;

  @ApiPropertyOptional({
    description: 'MenuSection this offer belongs to (availability window)',
  })
  @IsOptional()
  @IsString()
  menuSectionId?: string;

  @ApiProperty({ example: '120.00' })
  @IsString()
  price: string;

  @ApiPropertyOptional({ example: 'TWD', default: 'TWD' })
  @IsOptional()
  @IsString()
  priceCurrency?: string;

  @ApiPropertyOptional({ enum: ITEM_AVAILABILITY_VALUES, default: 'InStock' })
  @IsOptional()
  @IsEnum(ITEM_AVAILABILITY_VALUES)
  availability?: ItemAvailability;

  @ApiPropertyOptional({ description: 'ISO 8601 time or datetime, e.g. 07:00' })
  @IsOptional()
  @IsString()
  availabilityStarts?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 time or datetime, e.g. 11:00' })
  @IsOptional()
  @IsString()
  availabilityEnds?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date' })
  @IsOptional()
  @IsString()
  priceValidUntil?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date' })
  @IsOptional()
  @IsString()
  validFrom?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date' })
  @IsOptional()
  @IsString()
  validThrough?: string;
}
