import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  ItemAvailability,
  NutritionInformation,
  PriceSpecification,
  QuantitativeValue,
  RestrictedDiet,
} from 'src/db/schema/menus';

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

  @ApiPropertyOptional()
  availability: ItemAvailability | null;

  @ApiPropertyOptional()
  deliveryLeadTime: QuantitativeValue | null;

  @ApiPropertyOptional()
  inventoryLevel: QuantitativeValue | null;

  @ApiPropertyOptional()
  priceSpecification: PriceSpecification | null;

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

  @ApiPropertyOptional({ isArray: true })
  suitableForDiet: RestrictedDiet[] | null;

  @ApiPropertyOptional()
  nutrition: NutritionInformation | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ type: [OrderMenuOfferResponseDto] })
  offers: OrderMenuOfferResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class OrderMenuSectionResponseDto {
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
