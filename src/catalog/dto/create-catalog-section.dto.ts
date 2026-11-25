import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  IMAGE_DATA_URL_MAX_LENGTH,
  IMAGE_DATA_URL_PATTERN,
} from '../../common/constants/image.js';
import {
  IsLocalizedText,
  IsCompleteLocalizedText,
} from '../../common/decorators/is-localized-text.decorator.js';
import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import { emptyLocalizedTextToNull } from '../../common/utils/localized-text.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class CreateCatalogSectionDto {
  @ApiPropertyOptional({
    description:
      '上層分類；品牌分類的上層只能是品牌分類，獨家分類的上層只能是品牌分類或同門市的獨家分類',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  parentCatalogSectionId?: string | null;

  @ApiProperty({
    type: LocalizedTextDto,
    example: { 'zh-TW': '主餐', en: 'Main Course' },
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
  @Matches(IMAGE_DATA_URL_PATTERN)
  image?: string | null;
}
