import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  PriceSpecificationDto,
  QuantitativeValueDto,
} from './create-offer.dto';
import { NutritionInformationDto } from './nutrition-information.dto';

import type { ItemAvailability, RestrictedDiet } from 'src/db/schema/menus';
import { itemAvailabilityEnum, restrictedDietEnum } from 'src/db/schema/menus';

export class OrderMenuOfferResponseDto {
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

  @ApiPropertyOptional({ enum: itemAvailabilityEnum.enumValues })
  availability: ItemAvailability | null;

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

export class OrderMenuItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  menuId: string | null;

  @ApiPropertyOptional()
  menuSectionId: string | null;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  image: string | null;

  @ApiPropertyOptional({ enum: restrictedDietEnum.enumValues, isArray: true })
  suitableForDiet: RestrictedDiet[] | null;

  @ApiPropertyOptional({ type: NutritionInformationDto })
  nutrition: NutritionInformationDto | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ type: [OrderMenuOfferResponseDto] })
  offers: OrderMenuOfferResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class OrderMenuResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  menuId: string | null;

  @ApiPropertyOptional()
  parentSectionId: string | null;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  image: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ type: [OrderMenuItemResponseDto] })
  menuItems: OrderMenuItemResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
