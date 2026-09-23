import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsInt, IsObject, IsOptional, Min } from 'class-validator';
import type { LocalizedText } from 'src/db/schema/enums';

export class UpdateModifierGroupDto {
  @ApiPropertyOptional({ description: '群組名稱' })
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
