import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { LocalizedText } from '../../db/schema/enums.js';

import { LOCALIZED_TEXT_SCHEMA } from '../../common/utils/localized-text.js';

export class MenuResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  organizationId: string;

  @ApiProperty({ ...LOCALIZED_TEXT_SCHEMA })
  name: LocalizedText;

  @ApiPropertyOptional({ ...LOCALIZED_TEXT_SCHEMA, nullable: true })
  description: LocalizedText | null;

  @ApiPropertyOptional()
  image: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
