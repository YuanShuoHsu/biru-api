import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { NutritionInformation, RestrictedDiet } from 'src/db/schema/menus';

import { OfferResponseDto } from './offer-response.dto';

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

  @ApiPropertyOptional({ isArray: true })
  suitableForDiet: RestrictedDiet[] | null;

  @ApiPropertyOptional()
  nutrition: NutritionInformation | null;

  @ApiPropertyOptional({ type: OfferResponseDto })
  offer: OfferResponseDto | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
