import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateMenuItemAddOnDto {
  @ApiPropertyOptional({ description: 'MenuItem to add on' })
  @IsOptional()
  @IsString()
  addOnMenuItemId?: string;

  @ApiPropertyOptional({ description: 'MenuSection to add on' })
  @IsOptional()
  @IsString()
  addOnMenuSectionId?: string;
}
