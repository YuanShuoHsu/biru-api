import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class MenuItemAddOnResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  menuItemId: string;

  @ApiPropertyOptional()
  addOnMenuItemId: string | null;

  @ApiPropertyOptional({ type: LocalizedTextDto, nullable: true })
  addOnMenuItemName: LocalizedText | null;

  @ApiPropertyOptional()
  addOnMenuSectionId: string | null;

  @ApiPropertyOptional({ type: LocalizedTextDto, nullable: true })
  addOnMenuSectionName: LocalizedText | null;

  @ApiPropertyOptional()
  addOnMenuItemSectionId: string | null;

  @ApiPropertyOptional({ type: LocalizedTextDto, nullable: true })
  addOnMenuItemSectionName: LocalizedText | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
