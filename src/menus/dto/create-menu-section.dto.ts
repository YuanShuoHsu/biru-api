import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsObject, IsOptional, IsString } from 'class-validator';
import type { LocalizedText } from 'src/db/schema/enums';

export class CreateMenuSectionDto {
  @ApiPropertyOptional({ description: 'Parent section ID for nested sections' })
  @IsOptional()
  @IsString()
  parentSectionId?: string;

  @ApiProperty({ example: { 'zh-TW': '主餐', en: 'Main Course' } })
  @IsObject()
  name: LocalizedText;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  description?: LocalizedText;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;
}
