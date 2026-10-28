import { ApiProperty } from '@nestjs/swagger';

export class PublicStorePhotoResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: '圖片來源（data URL）' }) image: string;
  @ApiProperty({ description: '依 lang 取出的替代文字' }) alt: string;
}
