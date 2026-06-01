import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsEnum, IsOptional, IsString } from 'class-validator';
import { languageEnum, type Language } from 'src/db/schema/menus';

export class CreateMenuDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ enum: languageEnum.enumValues })
  @IsOptional()
  @IsEnum(languageEnum.enumValues)
  inLanguage?: Language;
}
