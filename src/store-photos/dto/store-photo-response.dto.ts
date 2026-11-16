import { ApiProperty } from '@nestjs/swagger';

import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class StorePhotoResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;
  @ApiProperty({ type: LocalizedTextDto }) alt: LocalizedText;
  @ApiProperty() isActive: boolean;
  @ApiProperty() sortOrder: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class StorePhotoListResponseDto {
  @ApiProperty({ type: [StorePhotoResponseDto] }) data: StorePhotoResponseDto[];
  @ApiProperty() total: number;
}
