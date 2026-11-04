import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  IsBoolean,
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import {
  IMAGE_DATA_URL_MAX_LENGTH,
  IMAGE_DATA_URL_PATTERN,
} from '../../common/constants/image.js';
import {
  IsCompleteLocalizedText,
  IsLocalizedText,
} from '../../common/decorators/is-localized-text.decorator.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class CreateStorePhotoDto {
  @ApiProperty({ description: '圖片來源（data URL）' })
  @IsString()
  @MaxLength(IMAGE_DATA_URL_MAX_LENGTH)
  @Matches(IMAGE_DATA_URL_PATTERN)
  image: string;

  @ApiProperty({
    description: '替代文字',
    example: { 'zh-TW': '門市外觀', en: 'Storefront' },
  })
  @IsLocalizedText()
  @IsCompleteLocalizedText()
  alt: LocalizedText;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '未帶時排在最後' })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateStorePhotoDto extends PartialType(CreateStorePhotoDto, {
  skipNullProperties: false,
}) {}
