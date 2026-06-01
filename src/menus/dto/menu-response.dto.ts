import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { languageEnum, type Language } from 'src/db/schema/menus';

export class MenuResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  organizationId: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  image: string | null;

  @ApiPropertyOptional({ enum: languageEnum.enumValues })
  inLanguage: Language | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
