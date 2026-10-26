import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { IMAGE_DATA_URL_MAX_LENGTH } from '../../common/constants/image.js';
import {
  LOCALIZED_TEXT_SCHEMA,
  emptyLocalizedTextToNull,
} from '../../common/utils/localized-text.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class CreateMenuSectionDto {
  @ApiPropertyOptional({ description: 'Parent section ID for nested sections' })
  @IsOptional()
  @IsString()
  parentSectionId?: string;

  @ApiProperty({
    ...LOCALIZED_TEXT_SCHEMA,
    example: { 'zh-TW': '主餐', en: 'Main Course' },
  })
  @IsObject()
  name: LocalizedText;

  @ApiPropertyOptional({ ...LOCALIZED_TEXT_SCHEMA, nullable: true })
  @IsOptional()
  @IsObject()
  @Transform(({ value }: { value: unknown }) => emptyLocalizedTextToNull(value))
  description?: LocalizedText | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(IMAGE_DATA_URL_MAX_LENGTH)
  image?: string;

  @ApiPropertyOptional({
    description:
      '工作單印表機；null 時沿用上層分類，最上層也沒設就印到預設工作單印表機',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  orderTicketPrinterId?: string | null;
}
