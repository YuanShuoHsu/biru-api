import { ApiPropertyOptional } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { IMAGE_DATA_URL_MAX_LENGTH } from '../../common/constants/image.js';
import {
  ApiLocalizedTextProperty,
  ApiLocalizedTextPropertyOptional,
} from '../../common/decorators/api-localized-text-property.decorator.js';
import { emptyLocalizedTextToNull } from '../../common/utils/localized-text.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class CreateMenuDto {
  @ApiLocalizedTextProperty({
    example: { 'zh-TW': '午餐菜單', en: 'Lunch Menu' },
  })
  @IsObject()
  name: LocalizedText;

  @ApiLocalizedTextPropertyOptional({ nullable: true })
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
