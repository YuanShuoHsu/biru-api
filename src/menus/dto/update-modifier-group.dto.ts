import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsInt, IsObject, IsOptional, Min } from 'class-validator';
import { LOCALIZED_TEXT_SCHEMA } from '../../common/utils/localized-text.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class UpdateModifierGroupDto {
  @ApiPropertyOptional({ ...LOCALIZED_TEXT_SCHEMA, description: '群組名稱' })
  @IsOptional()
  @IsObject()
  displayName?: LocalizedText;

  @ApiPropertyOptional({ description: '最少選擇數量；>= 1 代表必選' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minSelectionCount?: number;

  @ApiPropertyOptional({
    nullable: true,
    description: '最多選擇數量；null 為不限',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSelectionCount?: number | null;
}
