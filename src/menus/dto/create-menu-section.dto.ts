import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { IMAGE_DATA_URL_MAX_LENGTH } from 'src/common/constants/image';
import { emptyLocalizedTextToNull } from 'src/common/utils/localized-text';
import type { LocalizedText } from 'src/db/schema/enums';

export class CreateMenuSectionDto {
  @ApiPropertyOptional({ description: 'Parent section ID for nested sections' })
  @IsOptional()
  @IsString()
  parentSectionId?: string;

  @ApiProperty({ example: { 'zh-TW': '主餐', en: 'Main Course' } })
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
  @MaxLength(IMAGE_DATA_URL_MAX_LENGTH)
  image?: string;
}
