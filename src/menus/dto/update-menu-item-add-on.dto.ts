import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateMenuItemAddOnDto {
  @ApiPropertyOptional({ description: 'Add-on menu item ID', nullable: true })
  @IsOptional()
  @IsString()
  addOnMenuItemId?: string | null;

  @ApiPropertyOptional({
    description: 'Add-on menu section ID',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  addOnMenuSectionId?: string | null;
}
