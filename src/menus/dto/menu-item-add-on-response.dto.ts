import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ApiLocalizedTextPropertyOptional } from '../../common/decorators/api-localized-text-property.decorator.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class MenuItemAddOnResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  menuItemId: string;

  @ApiPropertyOptional()
  addOnMenuItemId: string | null;

  @ApiLocalizedTextPropertyOptional({ nullable: true })
  addOnMenuItemName: LocalizedText | null;

  @ApiPropertyOptional()
  addOnMenuSectionId: string | null;

  @ApiLocalizedTextPropertyOptional({ nullable: true })
  addOnMenuSectionName: LocalizedText | null;

  @ApiPropertyOptional()
  addOnMenuItemSectionId: string | null;

  @ApiLocalizedTextPropertyOptional({ nullable: true })
  addOnMenuItemSectionName: LocalizedText | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
