import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  itemAvailabilityEnum,
  type ItemAvailability,
} from '../../db/schema/menus.js';
import {
  restrictedDietEnum,
  servingTemperatureEnum,
  servingTemperatureLevelEnum,
  sweetnessEnum,
  sweetnessLevelEnum,
  type RestrictedDiet,
  type ServingTemperature,
  type ServingTemperatureLevel,
  type Sweetness,
  type SweetnessLevel,
} from '../../db/schema/enums.js';
import { orderModeEnum, type OrderMode } from '../../db/schema/orders.js';

import {
  EligibleQuantityDto,
  PriceSpecificationDto,
  QuantitativeValueDto,
} from './create-offer.dto.js';
import { NutritionInformationDto } from './nutrition-information.dto.js';

class OrderMenuOfferResponseDto {
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

  @ApiPropertyOptional({ description: '每日限量；null 代表非每日限量' })
  dailyLimit: number | null;

  @ApiPropertyOptional({
    type: EligibleQuantityDto,
    description: '限購；null 代表不限購',
  })
  eligibleQuantity: EligibleQuantityDto | null;

  @ApiPropertyOptional({
    description:
      '登入會員今天在這間門市已買的份數（不含已取消與全額退款）；未登入或不限購時為 null',
    type: Number,
  })
  purchasedToday: number | null;

  @ApiPropertyOptional({ type: PriceSpecificationDto })
  priceSpecification: PriceSpecificationDto | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

class OrderMenuModifierResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  modifierGroupId: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiPropertyOptional({ description: '加價金額；null 代表不影響價格' })
  priceAdjustment: string | null;

  @ApiProperty({ description: 'priceAdjustment 的幣別；來自店家設定' })
  priceCurrency: string;

  @ApiPropertyOptional({
    enum: itemAvailabilityEnum.enumValues,
    enumName: 'ItemAvailability',
  })
  availability: ItemAvailability | null;

  @ApiProperty({
    description: '可販售的點餐模式',
    enum: orderModeEnum.enumValues,
    enumName: 'OrderMode',
    isArray: true,
  })
  availableModes: OrderMode[];

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

class OrderMenuModifierGroupResponseDto {
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

class OrderMenuAddOnItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty({
    description: '可販售的點餐模式',
    enum: orderModeEnum.enumValues,
    enumName: 'OrderMode',
    isArray: true,
  })
  availableModes: OrderMode[];

  @ApiProperty({
    description: '可供應的飲品溫度；空陣列代表不適用',
    enum: servingTemperatureEnum.enumValues,
    enumName: 'ServingTemperature',
    isArray: true,
  })
  servingTemperatures: ServingTemperature[];

  @ApiPropertyOptional({
    description: '推薦的溫度細項；未設定為 null',
    enum: servingTemperatureLevelEnum.enumValues,
    enumName: 'ServingTemperatureLevel',
    nullable: true,
  })
  recommendedServingTemperatureLevel: ServingTemperatureLevel | null;

  @ApiProperty({
    description: '甜度：不適用、固定、可調',
    enum: sweetnessEnum.enumValues,
    enumName: 'Sweetness',
  })
  sweetness: Sweetness;

  @ApiPropertyOptional({
    description: '甜度固定時的等級；其他情況為 null',
    enum: sweetnessLevelEnum.enumValues,
    enumName: 'SweetnessLevel',
    nullable: true,
  })
  fixedSweetnessLevel: SweetnessLevel | null;

  @ApiPropertyOptional({
    description: '推薦的甜度；僅甜度可調時可能有值',
    enum: sweetnessLevelEnum.enumValues,
    enumName: 'SweetnessLevel',
    nullable: true,
  })
  recommendedSweetnessLevel: SweetnessLevel | null;

  @ApiProperty({ type: [OrderMenuOfferResponseDto] })
  offers: OrderMenuOfferResponseDto[];

  @ApiProperty({ type: [OrderMenuModifierGroupResponseDto] })
  modifierGroups: OrderMenuModifierGroupResponseDto[];
}

class OrderMenuAddOnResponseDto {
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

class OrderMenuItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  menuId: string;

  @ApiPropertyOptional()
  menuSectionId: string | null;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiPropertyOptional({ enum: restrictedDietEnum.enumValues, isArray: true })
  suitableForDiet: RestrictedDiet[] | null;

  @ApiProperty({
    description: '可供應的飲品溫度；空陣列代表不適用',
    enum: servingTemperatureEnum.enumValues,
    enumName: 'ServingTemperature',
    isArray: true,
  })
  servingTemperatures: ServingTemperature[];

  @ApiPropertyOptional({
    description: '推薦的溫度細項；未設定為 null',
    enum: servingTemperatureLevelEnum.enumValues,
    enumName: 'ServingTemperatureLevel',
    nullable: true,
  })
  recommendedServingTemperatureLevel: ServingTemperatureLevel | null;

  @ApiProperty({
    description: '甜度：不適用、固定、可調',
    enum: sweetnessEnum.enumValues,
    enumName: 'Sweetness',
  })
  sweetness: Sweetness;

  @ApiPropertyOptional({
    description: '甜度固定時的等級；其他情況為 null',
    enum: sweetnessLevelEnum.enumValues,
    enumName: 'SweetnessLevel',
    nullable: true,
  })
  fixedSweetnessLevel: SweetnessLevel | null;

  @ApiPropertyOptional({
    description: '推薦的甜度；僅甜度可調時可能有值',
    enum: sweetnessLevelEnum.enumValues,
    enumName: 'SweetnessLevel',
    nullable: true,
  })
  recommendedSweetnessLevel: SweetnessLevel | null;

  @ApiProperty({
    description: '可販售的點餐模式',
    enum: orderModeEnum.enumValues,
    enumName: 'OrderMode',
    isArray: true,
  })
  availableModes: OrderMode[];

  @ApiPropertyOptional({ type: NutritionInformationDto })
  nutrition: NutritionInformationDto | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({
    description:
      '近期售出數量（含被加購的次數）減去同期退款份數；退款多於售出時為負數',
  })
  sold: number;

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

class OrderMenuSectionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  menuId: string;

  @ApiPropertyOptional()
  parentSectionId: string | null;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

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

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty({ description: '店家定價幣別；整份菜單共用一個' })
  currency: string;

  @ApiProperty({ type: [OrderMenuSectionResponseDto] })
  sections: OrderMenuSectionResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
