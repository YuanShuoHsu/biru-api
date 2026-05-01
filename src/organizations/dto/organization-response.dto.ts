import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrganizationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional()
  logo: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  metadata: string | null;

  @ApiProperty()
  defaultLocale: string;

  // https://schema.org/PostalAddress
  @ApiPropertyOptional({ default: 'TW' })
  addressCountry: string | null;

  @ApiPropertyOptional()
  addressLocality: string | null;

  @ApiPropertyOptional()
  addressRegion: string | null;

  @ApiPropertyOptional()
  extendedAddress: string | null;

  @ApiPropertyOptional()
  postOfficeBoxNumber: string | null;

  @ApiPropertyOptional()
  postalCode: string | null;

  @ApiPropertyOptional()
  streetAddress: string | null;

  @ApiProperty()
  isActive: boolean;
}
