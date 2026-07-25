import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateBannerDto {
  @ApiProperty({ description: '圖片來源（data URL）' })
  @IsString()
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
