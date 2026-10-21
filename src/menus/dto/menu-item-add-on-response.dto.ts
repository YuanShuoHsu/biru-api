import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { LocalizedText } from '../../db/schema/enums.js';

export class MenuItemAddOnResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  menuItemId: string;

  @ApiPropertyOptional()
  addOnMenuItemId: string | null;

  @ApiPropertyOptional()
  addOnMenuItemName: LocalizedText | null;

  @ApiPropertyOptional()
  addOnMenuSectionId: string | null;

  @ApiPropertyOptional()
  addOnMenuSectionName: LocalizedText | null;

  @ApiPropertyOptional()
  addOnMenuItemSectionId: string | null;

  @ApiPropertyOptional()
  addOnMenuItemSectionName: LocalizedText | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
