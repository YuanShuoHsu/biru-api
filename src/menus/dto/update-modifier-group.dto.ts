import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsInt, IsOptional, Min } from 'class-validator';
import {
  IsLocalizedText,
  IsCompleteLocalizedText,
} from '../../common/decorators/is-localized-text.decorator.js';
import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class UpdateModifierGroupDto {
  @ApiPropertyOptional({ type: LocalizedTextDto, description: '群組名稱' })
  @IsOptional()
  @IsLocalizedText()
  @IsCompleteLocalizedText()
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
