import { ApiProperty } from '@nestjs/swagger';

import type { LocalizedText } from '../../db/schema/enums.js';

export class StorePhotoResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: '圖片來源（data URL）' }) image: string;
  @ApiProperty() alt: LocalizedText;
  @ApiProperty() isActive: boolean;
  @ApiProperty() sortOrder: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class StorePhotoListResponseDto {
  @ApiProperty({ type: [StorePhotoResponseDto] }) data: StorePhotoResponseDto[];
  @ApiProperty() total: number;
}
