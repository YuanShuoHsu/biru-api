import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ItemAvailability, QuantitativeValue } from 'src/db/schema/menus';

export class OfferResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  menuItemId: string | null;

  @ApiPropertyOptional()
  menuSectionId: string | null;

  @ApiPropertyOptional()
  name: string | null;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  price: string | null;

  @ApiPropertyOptional()
  priceCurrency: string | null;

  @ApiPropertyOptional()
  availability: ItemAvailability | null;

  @ApiPropertyOptional()
  availabilityStarts: string | null;

  @ApiPropertyOptional()
  availabilityEnds: string | null;

  @ApiPropertyOptional()
  priceValidUntil: string | null;

  @ApiPropertyOptional()
  validFrom: string | null;

  @ApiPropertyOptional()
  validThrough: string | null;

  @ApiPropertyOptional()
  sku: string | null;

  @ApiPropertyOptional()
  eligibleQuantity: QuantitativeValue | null;

  @ApiPropertyOptional()
  sellerId: string | null;

  @ApiPropertyOptional({ type: [String] })
  eligibleRegion: string[] | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
