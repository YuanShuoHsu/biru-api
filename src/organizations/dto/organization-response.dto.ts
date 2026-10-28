import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PICKUP_MAX_ADVANCE_DAYS } from '../../common/constants/pickup.js';

import { PublicSpecialHoursDto } from './special-hours.dto.js';

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
  @ApiProperty()
  addressCountry: string;

  @ApiProperty()
  addressLocality: string;

  @ApiProperty()
  addressRegion: string;

  @ApiPropertyOptional()
  extendedAddress: string | null;

  @ApiPropertyOptional()
  postalCode: string | null;

  @ApiProperty()
  streetAddress: string;

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
    description: '內用桌數，桌號為 1 到此數；null 代表不開放內用',
    nullable: true,
    type: Number,
  })
  dineInTableCount: number | null;

  @ApiPropertyOptional({
    description: '停業時間；營業中為 null',
    nullable: true,
  })
  closedAt: Date | null;
}

export class OrganizationDetailResponseDto extends OrganizationResponseDto {
  @ApiProperty({
    type: [PublicSpecialHoursDto],
    description: `與今天到 ${PICKUP_MAX_ADVANCE_DAYS} 天後（含兩端）重疊的特殊營業日，不隨店家的自取預約天數設定變動`,
  })
  specialHours: PublicSpecialHoursDto[];
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
