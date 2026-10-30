import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';
import {
  IsLocalizedText,
  IsCompleteLocalizedText,
} from '../../common/decorators/is-localized-text.decorator.js';
import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class CreateModifierGroupDto {
  @ApiProperty({
    type: LocalizedTextDto,
    description: '群組名稱，如「甜度」「加料」',
    example: { 'zh-TW': '甜度', en: 'Sweetness' },
  })
  @IsLocalizedText()
  @IsCompleteLocalizedText()
  displayName: LocalizedText;

  @ApiPropertyOptional({
    default: 0,
    description: '最少選擇數量；>= 1 代表必選',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  minSelectionCount?: number;

  @ApiPropertyOptional({
    nullable: true,
    description: '最多選擇數量；min=max=1 為單選，null 為不限',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSelectionCount?: number | null;
}
