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

  // https://schema.org/PostalAddress
  @ApiPropertyOptional()
  addressCountry: string | null;

  @ApiPropertyOptional()
  addressLocality: string | null;

  @ApiPropertyOptional()
  addressRegion: string | null;

  @ApiPropertyOptional()
  extendedAddress: string | null;

  @ApiPropertyOptional()
  postalCode: string | null;

  @ApiPropertyOptional()
  streetAddress: string | null;

  // https://schema.org/LocalBusiness
  @ApiPropertyOptional()
  hasMap: string | null;

  @ApiPropertyOptional()
  openingHours: string | null;

  @ApiPropertyOptional()
  telephone: string | null;

  // 點數設定：每累積 1 點所需消費金額；null = 未啟用點數
  @ApiPropertyOptional()
  amountPerPoint: string | null;

  // 點數效期（年）；null = 永久有效
  @ApiPropertyOptional()
  pointsValidityYears: number | null;
}
