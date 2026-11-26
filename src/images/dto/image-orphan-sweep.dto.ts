import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsBoolean, IsOptional } from 'class-validator';

import { SWEPT_IMAGE_KINDS, type SweptImageKind } from '../image-url.js';

export class ImageOrphanSweepDto {
  @ApiPropertyOptional({
    description: '為 true 才刪除；未帶時只回報會刪除的物件',
  })
  @IsOptional()
  @IsBoolean()
  apply?: boolean;
}

class ImageOrphanKindDto {
  @ApiProperty({ enum: SWEPT_IMAGE_KINDS })
  kind: SweptImageKind;

  scanned: number;

  count: number;

  keys: string[];
}

export class ImageOrphanSweepResponseDto {
  applied: boolean;

  kinds: ImageOrphanKindDto[];
}
