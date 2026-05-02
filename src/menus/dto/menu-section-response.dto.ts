import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MenuSectionResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  menuId: string | null;

  @ApiPropertyOptional()
  parentSectionId: string | null;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  image: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
