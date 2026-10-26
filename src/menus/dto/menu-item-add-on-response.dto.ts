import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { LocalizedText } from '../../db/schema/enums.js';

import { LOCALIZED_TEXT_SCHEMA } from '../../common/utils/localized-text.js';

export class MenuItemAddOnResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  menuItemId: string;

  @ApiPropertyOptional()
  addOnMenuItemId: string | null;

  @ApiPropertyOptional({ ...LOCALIZED_TEXT_SCHEMA, nullable: true })
  addOnMenuItemName: LocalizedText | null;

  @ApiPropertyOptional()
  addOnMenuSectionId: string | null;

  @ApiPropertyOptional({ ...LOCALIZED_TEXT_SCHEMA, nullable: true })
  addOnMenuSectionName: LocalizedText | null;

  @ApiPropertyOptional()
  addOnMenuItemSectionId: string | null;

  @ApiPropertyOptional({ ...LOCALIZED_TEXT_SCHEMA, nullable: true })
  addOnMenuItemSectionName: LocalizedText | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
