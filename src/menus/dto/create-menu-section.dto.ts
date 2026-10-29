import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IMAGE_DATA_URL_MAX_LENGTH } from '../../common/constants/image.js';
import {
  IsLocalizedText,
  IsRequiredLocalizedText,
} from '../../common/decorators/is-localized-text.decorator.js';
import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import { emptyLocalizedTextToNull } from '../../common/utils/localized-text.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class CreateMenuSectionDto {
  @ApiPropertyOptional({ description: 'Parent section ID for nested sections' })
  @IsOptional()
  @IsString()
  parentSectionId?: string;

  @ApiProperty({
    type: LocalizedTextDto,
    example: { 'zh-TW': '主餐', en: 'Main Course' },
  })
  @IsLocalizedText()
  @IsRequiredLocalizedText()
  name: LocalizedText;

  @ApiPropertyOptional({ type: LocalizedTextDto, nullable: true })
  @IsOptional()
  @IsLocalizedText()
  @Transform(({ value }: { value: unknown }) => emptyLocalizedTextToNull(value))
  description?: LocalizedText | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(IMAGE_DATA_URL_MAX_LENGTH)
  image?: string | null;

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
