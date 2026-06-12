import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  itemAvailabilityEnum,
  restrictedDietEnum,
  type ItemAvailability,
  type RestrictedDiet,
} from 'src/db/schema/menus';

import {
  PriceSpecificationDto,
  QuantitativeValueDto,
} from './create-offer.dto';
import { NutritionInformationDto } from './nutrition-information.dto';

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

  @ApiPropertyOptional({
    enum: itemAvailabilityEnum.enumValues,
    enumName: 'ItemAvailability',
  })
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

export class OrderMenuModifierResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  modifierGroupId: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional({ description: '加價金額；null 代表不影響價格' })
  priceAdjustment: string | null;

  @ApiPropertyOptional({
    enum: itemAvailabilityEnum.enumValues,
    enumName: 'ItemAvailability',
  })
  availability: ItemAvailability | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class OrderMenuModifierGroupResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ description: '最少選擇數量；>= 1 代表必選' })
  minSelectionCount: number;

  @ApiPropertyOptional({ description: '最多選擇數量；null 為不限' })
  maxSelectionCount: number | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ type: [OrderMenuModifierResponseDto] })
  modifiers: OrderMenuModifierResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class OrderMenuAddOnItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  image: string | null;

  @ApiProperty({ type: [OrderMenuOfferResponseDto] })
  offers: OrderMenuOfferResponseDto[];

  @ApiProperty({ type: [OrderMenuModifierGroupResponseDto] })
  modifierGroups: OrderMenuModifierGroupResponseDto[];
}

export class OrderMenuAddOnResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  menuItemId: string;

  @ApiPropertyOptional()
  addOnMenuItemId: string | null;

  @ApiPropertyOptional()
  addOnMenuSectionId: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({
    type: [OrderMenuAddOnItemResponseDto],
    description: '解析後的加購品項（指向品項為單筆；指向區塊為其所有品項）',
  })
  menuItems: OrderMenuAddOnItemResponseDto[];

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

  @ApiProperty({ type: [OrderMenuAddOnResponseDto] })
  addOns: OrderMenuAddOnResponseDto[];

  @ApiProperty({ type: [OrderMenuModifierGroupResponseDto] })
  modifierGroups: OrderMenuModifierGroupResponseDto[];

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

export class OrderMenuResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  image: string | null;

  @ApiProperty({ type: [OrderMenuSectionResponseDto] })
  sections: OrderMenuSectionResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
