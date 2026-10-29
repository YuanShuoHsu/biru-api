import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';

import { ModifierResponseDto } from './modifier-response.dto.js';

export class ModifierGroupResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  menuId: string;

  @ApiProperty({ type: LocalizedTextDto })
  displayName: LocalizedText;

  @ApiProperty({ description: '最少選擇數量；>= 1 代表必選' })
  minSelectionCount: number;

  @ApiPropertyOptional({ description: '最多選擇數量；null 為不限' })
  maxSelectionCount: number | null;

  @ApiProperty()
  sortOrder: number;

  @ApiPropertyOptional({
    type: [ModifierResponseDto],
    description: '群組底下的選項（依需求帶出）',
  })
  modifiers?: ModifierResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ModifierGroupListResponseDto {
  @ApiProperty({ type: [ModifierGroupResponseDto] })
  data: ModifierGroupResponseDto[];
  @ApiProperty() total: number;
}
