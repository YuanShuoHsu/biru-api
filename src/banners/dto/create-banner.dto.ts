import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { IMAGE_DATA_URL_MAX_LENGTH } from 'src/common/constants/image';

export class CreateBannerDto {
  @ApiProperty({ description: '圖片來源（data URL）' })
  @IsString()
  @MaxLength(IMAGE_DATA_URL_MAX_LENGTH)
  image: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '未帶時排在最後' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateBannerDto extends PartialType(CreateBannerDto) {}
