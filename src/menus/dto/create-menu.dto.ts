import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IMAGE_DATA_URL_MAX_LENGTH } from '../../common/constants/image.js';
import {
  IsLocalizedText,
  IsCompleteLocalizedText,
} from '../../common/decorators/is-localized-text.decorator.js';
import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import { emptyLocalizedTextToNull } from '../../common/utils/localized-text.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class CreateMenuDto {
  @ApiProperty({
    type: LocalizedTextDto,
    example: { 'zh-TW': '午餐菜單', en: 'Lunch Menu' },
  })
  @IsLocalizedText()
  @IsCompleteLocalizedText()
  name: LocalizedText;

  @ApiPropertyOptional({ type: LocalizedTextDto, nullable: true })
  @IsOptional()
  @IsLocalizedText()
  @IsCompleteLocalizedText()
  @Transform(({ value }: { value: unknown }) => emptyLocalizedTextToNull(value))
  description?: LocalizedText | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(IMAGE_DATA_URL_MAX_LENGTH)
  image?: string | null;
}
