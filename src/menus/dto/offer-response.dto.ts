import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  itemAvailabilityEnum,
  type ItemAvailability,
} from '../../db/schema/menus.js';

import {
  PriceSpecificationDto,
  QuantitativeValueDto,
} from './create-offer.dto.js';

export class OfferResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  menuItemId: string | null;

  @ApiPropertyOptional()
  menuSectionId: string | null;

  @ApiPropertyOptional()
  price: string | null;

  @ApiProperty({ description: 'price 的幣別；來自店家設定' })
  priceCurrency: string;

  @ApiPropertyOptional({
    enum: itemAvailabilityEnum.enumValues,
    enumName: 'ItemAvailability',
  })
  availability: ItemAvailability | null;

  @ApiPropertyOptional({ description: '可供應時段；null 代表全時段供應' })
  availableHours: string | null;

  @ApiPropertyOptional({ description: '預計準備時間（分鐘）' })
  deliveryLeadTimeMinutes: number | null;

  @ApiPropertyOptional({ type: QuantitativeValueDto })
  inventoryLevel: QuantitativeValueDto | null;

  @ApiPropertyOptional({ type: PriceSpecificationDto })
  priceSpecification: PriceSpecificationDto | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
