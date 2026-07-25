import { ApiProperty } from '@nestjs/swagger';

export class BannerResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: '圖片來源（data URL）' }) image: string;
  @ApiProperty() isActive: boolean;
  @ApiProperty() sortOrder: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
