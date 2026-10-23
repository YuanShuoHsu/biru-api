import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import { IMAGE_DATA_URL_MAX_LENGTH } from '../../common/constants/image.js';
import { emptyLocalizedTextToNull } from '../../common/utils/localized-text.js';
import type { LocalizedText } from '../../db/schema/enums.js';

@ValidatorConstraint({ name: 'isStartsAtBeforeEndsAt' })
class IsStartsAtBeforeEndsAt implements ValidatorConstraintInterface {
  validate(_: unknown, { object }: ValidationArguments): boolean {
    const { startsAt, endsAt } = object as CreateBannerDto;
    if (!startsAt || !endsAt) return true;

    return new Date(startsAt) < new Date(endsAt);
  }

  defaultMessage(): string {
    return 'startsAt 必須早於 endsAt';
  }
}

export class CreateBannerDto {
  @ApiProperty({ description: '圖片來源（data URL）' })
  @IsString()
  @MaxLength(IMAGE_DATA_URL_MAX_LENGTH)
  image: string;

  @ApiPropertyOptional({
    example: { 'zh-TW': '秋季新品上市', en: 'New autumn drinks' },
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  @Transform(({ value }: { value: unknown }) => emptyLocalizedTextToNull(value))
  alt?: LocalizedText | null;

  @ApiPropertyOptional({
    description: '點擊後前往的站內路徑（/ 開頭）或 https 網址',
    example: '/order',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^(?:\/(?![/\\])|https:\/\/[^\s\\/])[^\s\\]*$/)
  url?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  @Validate(IsStartsAtBeforeEndsAt)
  endsAt?: string | null;

  @ApiPropertyOptional({ description: '未帶時排在最後' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateBannerDto extends PartialType(CreateBannerDto) {}
