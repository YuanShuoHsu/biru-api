import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ApiLocalizedTextPropertyOptional } from '../../common/decorators/api-localized-text-property.decorator.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class BannerResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: '圖片來源（data URL）' }) image: string;
  @ApiLocalizedTextPropertyOptional({ nullable: true })
  alt: LocalizedText | null;
  @ApiPropertyOptional({ nullable: true }) url: string | null;
  @ApiProperty() isActive: boolean;
  @ApiPropertyOptional({ nullable: true }) startsAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) endsAt: Date | null;
  @ApiProperty() sortOrder: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
