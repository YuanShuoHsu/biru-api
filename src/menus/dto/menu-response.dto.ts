import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({ description: 'BCP 47 language tag, e.g. zh-TW' })
  inLanguage: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
