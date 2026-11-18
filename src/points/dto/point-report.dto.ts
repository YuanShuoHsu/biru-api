import { ApiProperty } from '@nestjs/swagger';

import { Matches } from 'class-validator';

export class PointReportQueryDto {
  @ApiProperty({ description: '對帳月份（Asia/Taipei）', example: '2026-10' })
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/)
  month: string;
}

export class PointReportAmountsDto {
  @ApiProperty() earnedAmount: number;
  @ApiProperty() grantedAmount: number;
  @ApiProperty() redeemedAmount: number;
  @ApiProperty() expiredAmount: number;
  @ApiProperty() outstandingAmount: number;
  @ApiProperty() crossStoreNetAmount: number;
}

export class PointReportRowDto {
  @ApiProperty({
    description: '發點門市；null 為沒有門市的舊點數',
    nullable: true,
    type: String,
  })
  organizationId: string | null;

  @ApiProperty({ nullable: true, type: String })
  organizationName: string | null;

  @ApiProperty({ description: '本月入帳的消費點數' })
  earnedPoints: number;

  @ApiProperty({ description: '本月人工加點' })
  grantedPoints: number;

  @ApiProperty({ description: '本店的點數本月被兌換成兌換券的點數' })
  redeemedPoints: number;

  @ApiProperty({
    description: '本店的點數兌換出的券，本月用在本店未取消訂單的點數',
  })
  usedAtOwnStorePoints: number;

  @ApiProperty({
    description: '本店的點數兌換出的券，本月用在其他門市未取消訂單的點數',
  })
  usedAtOtherStoresPoints: number;

  @ApiProperty({
    description: '其他門市（含舊點數）的點數兌換出的券，本月用在本店的點數',
  })
  otherStoresUsedHerePoints: number;

  @ApiProperty({
    description: 'usedAtOtherStoresPoints − otherStoresUsedHerePoints',
  })
  crossStoreNetPoints: number;

  @ApiProperty({ description: '本店的點數兌換出、到月底仍未使用的券的點數' })
  unusedRedeemedPoints: number;

  @ApiProperty({ description: '本月退款收回的點數' })
  revokedPoints: number;

  @ApiProperty({ description: '本月訂單取消收回的點數' })
  cancelledPoints: number;

  @ApiProperty({ description: '本月人工扣點' })
  adjustedPoints: number;

  @ApiProperty({ description: '本月用來抵銷欠點的點數' })
  settledPoints: number;

  @ApiProperty({ description: '本月到期失效、未使用的點數' })
  expiredPoints: number;

  @ApiProperty({ description: '月底（當月為現在）仍可使用的點數' })
  outstandingPoints: number;

  @ApiProperty({
    description: '扣點明細上線前已用掉、無法分配到用途的點數（上線前未分配）',
  })
  unallocatedLegacyPoints: number;

  @ApiProperty({ description: '點數兌換券本月在本店未取消訂單折抵的金額' })
  discountAmount: number;

  @ApiProperty({
    description: '以每點會計價值換算的金額；未設定會計價值時為 null',
    nullable: true,
    type: PointReportAmountsDto,
  })
  amounts: PointReportAmountsDto | null;
}

export class PointReportResponseDto {
  @ApiProperty() month: string;

  @ApiProperty({ nullable: true, type: String })
  accountingValuePerPoint: string | null;

  @ApiProperty({ type: [PointReportRowDto] })
  rows: PointReportRowDto[];
}

export class PointReportCounterpartDto {
  @ApiProperty({
    description: '對方門市；null 為沒有門市的舊點數',
    nullable: true,
    type: String,
  })
  organizationId: string | null;

  @ApiProperty({ nullable: true, type: String })
  organizationName: string | null;

  @ApiProperty({ description: '本店的點數本月用在對方門市的點數' })
  usedThereFromHerePoints: number;

  @ApiProperty({ description: '對方的點數本月用在本店的點數' })
  usedHereFromTherePoints: number;

  @ApiProperty({
    description: 'usedThereFromHerePoints − usedHereFromTherePoints',
  })
  netPoints: number;

  @ApiProperty({
    description: '以每點會計價值換算的 netPoints；未設定會計價值時為 null',
    nullable: true,
    type: Number,
  })
  netAmount: number | null;
}

export class PointReportDetailResponseDto {
  @ApiProperty() month: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() organizationName: string;

  @ApiProperty({ nullable: true, type: String })
  accountingValuePerPoint: string | null;

  @ApiProperty({ type: [PointReportCounterpartDto] })
  rows: PointReportCounterpartDto[];
}
