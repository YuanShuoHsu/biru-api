import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { LocalizedText } from 'src/db/schema/enums';
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
