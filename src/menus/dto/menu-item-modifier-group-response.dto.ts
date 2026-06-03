import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ModifierGroupResponseDto } from './modifier-group-response.dto';

export class MenuItemModifierGroupResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  menuItemId: string;

  @ApiProperty()
  modifierGroupId: string;

  @ApiProperty()
  sortOrder: number;

  @ApiPropertyOptional({
    type: ModifierGroupResponseDto,
    description: '掛上的群組（含選項，依需求帶出）',
  })
  modifierGroup?: ModifierGroupResponseDto;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
