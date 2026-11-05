import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class BannerResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;
  @ApiPropertyOptional({ type: LocalizedTextDto, nullable: true })
  alt: LocalizedText | null;
  @ApiPropertyOptional({ nullable: true }) url: string | null;
  @ApiProperty() isActive: boolean;
  @ApiPropertyOptional({ nullable: true }) startsAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) endsAt: Date | null;
  @ApiProperty() sortOrder: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class BannerListResponseDto {
  @ApiProperty({ type: [BannerResponseDto] }) data: BannerResponseDto[];
  @ApiProperty() total: number;
}
