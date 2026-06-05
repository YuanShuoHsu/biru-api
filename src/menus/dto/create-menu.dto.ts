import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsObject, IsOptional, IsString } from 'class-validator';
import type { LocalizedText } from 'src/db/schema/enums';

export class CreateMenuDto {
  @ApiProperty({ example: { 'zh-TW': '午餐菜單', en: 'Lunch Menu' } })
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
