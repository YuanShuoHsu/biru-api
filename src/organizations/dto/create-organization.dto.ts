import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsOptional, IsString } from 'class-validator';

export class CreateOrganizationDto {
  // https://schema.org/PostalAddress
  @ApiPropertyOptional({ default: 'TW' })
  @IsOptional()
  @IsString()
  addressCountry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressLocality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressRegion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  extendedAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postOfficeBoxNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  streetAddress?: string;
}
