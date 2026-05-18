import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  ItemAvailability,
  QuantitativeValue,
  UnitPriceSpecification,
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
  deliveryLeadTime: QuantitativeValue | null;

  @ApiPropertyOptional()
  inventoryLevel: QuantitativeValue | null;

  @ApiPropertyOptional()
  priceSpecification: UnitPriceSpecification[] | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
