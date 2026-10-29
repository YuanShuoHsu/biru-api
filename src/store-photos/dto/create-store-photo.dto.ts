import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { IMAGE_DATA_URL_MAX_LENGTH } from '../../common/constants/image.js';
import { IsLocalizedText } from '../../common/decorators/is-localized-text.decorator.js';
import { emptyLocalizedTextToNull } from '../../common/utils/localized-text.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class CreateStorePhotoDto {
  @ApiProperty({ description: '圖片來源（data URL）' })
  @IsString()
  @MaxLength(IMAGE_DATA_URL_MAX_LENGTH)
  image: string;

  @ApiProperty({
    description: '替代文字',
    example: { 'zh-TW': '門市外觀', en: 'Storefront' },
  })
  @IsLocalizedText()
  @Transform(({ value }: { value: unknown }) => emptyLocalizedTextToNull(value))
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
