import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsRFC3339,
  IsString,
  Matches,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import {
  IMAGE_DATA_URL_MAX_LENGTH,
  IMAGE_DATA_URL_PATTERN,
} from '../../common/constants/image.js';
import { IsLocalizedText } from '../../common/decorators/is-localized-text.decorator.js';
import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
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
  @Matches(IMAGE_DATA_URL_PATTERN)
  image: string;

  @ApiPropertyOptional({
    type: LocalizedTextDto,
    example: { 'zh-TW': '秋季新品上市', en: 'New autumn drinks' },
    nullable: true,
  })
  @IsOptional()
  @IsLocalizedText()
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
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsRFC3339()
  @IsISO8601({ strict: true })
  startsAt?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsRFC3339()
  @IsISO8601({ strict: true })
  @Validate(IsStartsAtBeforeEndsAt)
  endsAt?: string | null;

  @ApiPropertyOptional({ description: '未帶時排在最後' })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateBannerDto extends PartialType(CreateBannerDto, {
  skipNullProperties: false,
}) {}
