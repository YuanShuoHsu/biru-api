import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ApiLocalizedTextProperty,
  ApiLocalizedTextPropertyOptional,
} from '../../common/decorators/api-localized-text-property.decorator.js';
import type { LocalizedText } from '../../db/schema/enums.js';

export class MenuResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  organizationId: string;

  @ApiLocalizedTextProperty()
  name: LocalizedText;

  @ApiLocalizedTextPropertyOptional({ nullable: true })
  description: LocalizedText | null;

  @ApiPropertyOptional()
  image: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
