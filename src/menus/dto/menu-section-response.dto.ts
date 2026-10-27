import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LocalizedTextDto } from '../../common/dto/localized-text.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class MenuSectionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  menuId: string;

  @ApiPropertyOptional()
  parentSectionId: string | null;

  @ApiProperty({ type: LocalizedTextDto })
  name: LocalizedText;

  @ApiPropertyOptional({ type: LocalizedTextDto, nullable: true })
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
