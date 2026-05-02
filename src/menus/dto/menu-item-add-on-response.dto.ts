import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MenuItemAddOnResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  menuItemId: string;

  @ApiPropertyOptional()
  addOnMenuItemId: string | null;

  @ApiPropertyOptional()
  addOnMenuSectionId: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
