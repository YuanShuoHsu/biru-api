import { ApiProperty, PickType } from '@nestjs/swagger';

import { ModifierGroupResponseDto } from '../../menus/dto/modifier-group-response.dto.js';

export class CatalogModifierGroupResponseDto extends PickType(
  ModifierGroupResponseDto,
  [
    'id',
    'displayName',
    'minSelectionCount',
    'maxSelectionCount',
    'sortOrder',
    'createdAt',
    'updatedAt',
  ],
) {
  @ApiProperty({
    description: 'null 為品牌群組，有值為該門市的獨家群組',
    nullable: true,
    type: String,
  })
  ownerOrganizationId: string | null;
}

export class CatalogModifierGroupListResponseDto {
  @ApiProperty({ type: [CatalogModifierGroupResponseDto] })
  data: CatalogModifierGroupResponseDto[];
  @ApiProperty() total: number;
}
