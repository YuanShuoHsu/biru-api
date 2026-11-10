import { ApiProperty } from '@nestjs/swagger';

export class PublicStorePhotoResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;
  @ApiProperty({ description: '依 lang 取出的替代文字' }) alt: string;
}
