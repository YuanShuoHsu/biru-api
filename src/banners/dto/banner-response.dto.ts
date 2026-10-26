import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { LocalizedText } from '../../db/schema/enums.js';

import { LOCALIZED_TEXT_SCHEMA } from '../../common/utils/localized-text.js';

export class BannerResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: '圖片來源（data URL）' }) image: string;
  @ApiPropertyOptional({ ...LOCALIZED_TEXT_SCHEMA, nullable: true })
  alt: LocalizedText | null;
  @ApiPropertyOptional({ nullable: true }) url: string | null;
  @ApiProperty() isActive: boolean;
  @ApiPropertyOptional({ nullable: true }) startsAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) endsAt: Date | null;
  @ApiProperty() sortOrder: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
