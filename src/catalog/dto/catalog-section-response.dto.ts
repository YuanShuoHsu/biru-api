import { ApiProperty } from '@nestjs/swagger';

import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class CatalogSectionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({
    description: 'null 為品牌分類，有值為該門市的獨家分類',
    nullable: true,
    type: String,
  })
  ownerOrganizationId: string | null;

  @ApiProperty({ nullable: true, type: String })
  parentCatalogSectionId: string | null;

  @ApiProperty({ type: LocalizedTextDto })
  name: LocalizedText;

  @ApiProperty({ type: LocalizedTextDto, nullable: true })
  description: LocalizedText | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class CatalogSectionListResponseDto {
  @ApiProperty({ type: [CatalogSectionResponseDto] })
  data: CatalogSectionResponseDto[];
  @ApiProperty() total: number;
}
