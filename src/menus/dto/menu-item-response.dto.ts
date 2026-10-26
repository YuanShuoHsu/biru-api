import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LOCALIZED_TEXT_SCHEMA } from '../../common/utils/localized-text.js';

import {
  servingTemperatureEnum,
  servingTemperatureLevelEnum,
  sweetnessEnum,
  sweetnessLevelEnum,
  type LocalizedText,
  type ServingTemperature,
  type ServingTemperatureLevel,
  type Sweetness,
  type SweetnessLevel,
} from '../../db/schema/enums.js';
import {
  restrictedDietEnum,
  type RestrictedDiet,
} from '../../db/schema/menus.js';
import { orderModeEnum, type OrderMode } from '../../db/schema/orders.js';

import { MenuItemRecipeResponseDto } from './menu-item-recipe-response.dto.js';
import { NutritionInformationDto } from './nutrition-information.dto.js';
import { OfferResponseDto } from './offer-response.dto.js';

export class MenuItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  menuId: string;

  @ApiPropertyOptional()
  menuSectionId: string | null;

  @ApiProperty({
    description: '工作單印表機；null 時沿用所屬分類',
    nullable: true,
    type: String,
  })
  orderTicketPrinterId: string | null;

  @ApiProperty({ ...LOCALIZED_TEXT_SCHEMA })
  name: LocalizedText;

  @ApiPropertyOptional({ ...LOCALIZED_TEXT_SCHEMA, nullable: true })
  description: LocalizedText | null;

  @ApiPropertyOptional()
  image: string | null;

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

  @ApiPropertyOptional({ type: OfferResponseDto })
  offer: OfferResponseDto | null;

  @ApiPropertyOptional({ type: MenuItemRecipeResponseDto })
  recipe?: MenuItemRecipeResponseDto | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
