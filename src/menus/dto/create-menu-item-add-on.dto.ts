import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateMenuItemAddOnDto {
  @ApiPropertyOptional({ description: 'Add-on menu item ID' })
  @IsOptional()
  @IsString()
  addOnMenuItemId?: string;

  @ApiPropertyOptional({ description: 'Add-on menu section ID' })
  @IsOptional()
  @IsString()
  addOnMenuSectionId?: string;
}
