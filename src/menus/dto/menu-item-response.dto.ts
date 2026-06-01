import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { RestrictedDiet } from 'src/db/schema/menus';
import { restrictedDietEnum } from 'src/db/schema/menus';

import { OfferResponseDto } from './offer-response.dto';
import { NutritionInformationDto } from './nutrition-information.dto';

export class MenuItemResponseDto {
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

  @ApiPropertyOptional({ type: OfferResponseDto })
  offer: OfferResponseDto | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
