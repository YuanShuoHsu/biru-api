import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { emptyLocalizedTextToNull } from 'src/common/utils/localized-text';
import type { LocalizedText } from 'src/db/schema/enums';

export class CreateMenuDto {
  @ApiProperty({ example: { 'zh-TW': '午餐菜單', en: 'Lunch Menu' } })
  @IsObject()
  name: LocalizedText;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsObject()
  @Transform(({ value }: { value: unknown }) => emptyLocalizedTextToNull(value))
  description?: LocalizedText | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;
}
