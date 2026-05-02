import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ItemAvailability } from 'src/db/schema/menus';

export class OfferResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  menuItemId: string | null;

  @ApiPropertyOptional()
  menuSectionId: string | null;

  @ApiPropertyOptional()
  price: string | null;

  @ApiPropertyOptional({ default: 'TWD' })
  priceCurrency: string | null;

  @ApiPropertyOptional({ default: 'InStock' })
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

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
