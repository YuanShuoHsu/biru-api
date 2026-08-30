import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  itemAvailabilityEnum,
  type ItemAvailability,
} from 'src/db/schema/menus';

import {
  PriceSpecificationDto,
  QuantitativeValueDto,
} from './create-offer.dto';

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

  @ApiPropertyOptional({
    enum: itemAvailabilityEnum.enumValues,
    enumName: 'ItemAvailability',
  })
  availability: ItemAvailability | null;

  @ApiPropertyOptional({ description: '可供應時段；null 代表全時段供應' })
  availableHours: string | null;

  @ApiPropertyOptional({ type: QuantitativeValueDto })
  deliveryLeadTime: QuantitativeValueDto | null;

  @ApiPropertyOptional({ type: QuantitativeValueDto })
  inventoryLevel: QuantitativeValueDto | null;

  @ApiPropertyOptional({ type: PriceSpecificationDto })
  priceSpecification: PriceSpecificationDto | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
