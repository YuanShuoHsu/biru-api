import { ApiProperty } from '@nestjs/swagger';

import { IsIn, IsString, Matches } from 'class-validator';

import {
  IMAGE_EXTENSION_VALUES,
  IMAGE_KINDS,
  type ImageKind,
} from '../image-url.js';

export class ImageParamsDto {
  @ApiProperty({ enum: IMAGE_KINDS })
  @IsIn(IMAGE_KINDS)
  kind: ImageKind;

  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty({ description: '圖片所屬資料的 updatedAt（毫秒）' })
  @Matches(/^\d{1,15}$/)
  version: string;

  @ApiProperty({ enum: IMAGE_EXTENSION_VALUES })
  @IsIn(IMAGE_EXTENSION_VALUES)
  extension: string;
}
