import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
} from 'src/db/schema/enums';
import { restrictedDietEnum, type RestrictedDiet } from 'src/db/schema/menus';
import { orderModeEnum, type OrderMode } from 'src/db/schema/orders';

import { MenuItemRecipeResponseDto } from './menu-item-recipe-response.dto';
import { NutritionInformationDto } from './nutrition-information.dto';
import { OfferResponseDto } from './offer-response.dto';

export class MenuItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  menuId: string | null;

  @ApiPropertyOptional()
  menuSectionId: string | null;

  @ApiProperty()
  name: LocalizedText;

  @ApiPropertyOptional()
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
