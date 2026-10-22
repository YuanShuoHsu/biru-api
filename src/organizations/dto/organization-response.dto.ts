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

  @ApiProperty({ description: '店家目錄定價幣別', example: 'TWD' })
  currency: string;

  @ApiPropertyOptional()
  amountPerPoint: string | null;

  @ApiPropertyOptional()
  pointsValidityYears: number | null;

  @ApiProperty()
  pickupLeadMinutes: number;

  @ApiProperty()
  pickupMaxAdvanceDays: number;

  @ApiProperty()
  pickupCutoffMinutes: number;

  @ApiPropertyOptional({
    description: '停業時間；營業中為 null',
    nullable: true,
  })
  closedAt: Date | null;
}

export class MyOrganizationListItemDto extends OrganizationResponseDto {
  @ApiProperty({ description: '目前使用者可編輯組織資料' })
  canUpdate: boolean;

  @ApiProperty({
    description:
      '目前使用者有刪除權限；有訂單、出勤或薪資紀錄時依法須保存，不可刪除',
  })
  deletable: boolean;
}
