import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { LocalizedText } from '../../db/schema/enums.js';

import { LOCALIZED_TEXT_SCHEMA } from '../../common/utils/localized-text.js';

export class MenuSectionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  menuId: string;

  @ApiPropertyOptional()
  parentSectionId: string | null;

  @ApiProperty({ ...LOCALIZED_TEXT_SCHEMA })
  name: LocalizedText;

  @ApiPropertyOptional({ ...LOCALIZED_TEXT_SCHEMA, nullable: true })
  description: LocalizedText | null;

  @ApiPropertyOptional()
  image: string | null;

  @ApiProperty({
    description:
      '工作單印表機；null 時沿用上層分類，最上層也沒設就印到預設工作單印表機',
    nullable: true,
    type: String,
  })
  orderTicketPrinterId: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
