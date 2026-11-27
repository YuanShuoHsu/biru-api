import { ApiProperty, PickType } from '@nestjs/swagger';

import { PriceSpecificationDto } from '../../menus/dto/create-offer.dto.js';
import { MenuItemResponseDto } from '../../menus/dto/menu-item-response.dto.js';

export class CatalogItemResponseDto extends PickType(MenuItemResponseDto, [
  'id',
  'name',
  'description',
  'imageUrl',
  'suitableForDiet',
  'servingTemperatures',
  'recommendedServingTemperatureLevel',
  'sweetness',
  'fixedSweetnessLevel',
  'recommendedSweetnessLevel',
  'nutrition',
  'createdAt',
  'updatedAt',
]) {
  @ApiProperty({
    description: 'null 為品牌品項，有值為該門市的獨家品項',
    nullable: true,
    type: String,
  })
  ownerOrganizationId: string | null;

  @ApiProperty({ nullable: true, type: String })
  catalogSectionId: string | null;

  @ApiProperty({ nullable: true, type: String, example: '150.00' })
  suggestedPrice: string | null;

  @ApiProperty({ type: PriceSpecificationDto, nullable: true })
  priceSpecification: PriceSpecificationDto | null;

  @ApiProperty()
  discontinued: boolean;

  @ApiProperty()
  sortOrder: number;
}

export class CatalogItemListResponseDto {
  @ApiProperty({ type: [CatalogItemResponseDto] })
  data: CatalogItemResponseDto[];
  @ApiProperty() total: number;
}
