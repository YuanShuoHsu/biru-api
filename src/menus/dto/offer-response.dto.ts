import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  AvailableDeliveryMethod,
  ItemAvailability,
  QuantitativeValue,
} from 'src/db/schema/menus';

export class OfferResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  menuItemId: string | null;

  @ApiPropertyOptional()
  menuSectionId: string | null;

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
  eligibleQuantity: QuantitativeValue | null;

  @ApiPropertyOptional({ type: [String] })
  validForMemberTier: string[] | null;

  @ApiPropertyOptional({ type: [String] })
  availableDeliveryMethod: AvailableDeliveryMethod[] | null;

  @ApiPropertyOptional()
  deliveryLeadTime: QuantitativeValue | null;

  @ApiPropertyOptional()
  inventoryLevel: QuantitativeValue | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
