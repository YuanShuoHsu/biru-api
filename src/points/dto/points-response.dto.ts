import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  pointTransactionTypeEnum,
  type PointTransactionType,
} from '../../db/schema/points.js';

import { CustomerCouponDto } from '../../coupons/dto/coupon-response.dto.js';

export class PointsCouponDto extends CustomerCouponDto {
  @ApiPropertyOptional({
    description: '限定店家的店名清單；null = 全部店家通用',
    nullable: true,
    type: [String],
  })
  applicableOrganizationNames?: string[] | null;
  @ApiProperty({ description: '兌換所需點數' }) pointsCost: number;
}

export class PointTransactionDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional({ description: 'earn 來源訂單的取餐編號' })
  confirmationNumber?: string | null;
  @ApiPropertyOptional({ description: 'redeem 兌換的優惠券代碼' })
  couponCode?: string | null;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional() expiresAt?: Date | null;
  @ApiPropertyOptional({ description: 'earn 來源訂單編號' })
  orderNumber?: string | null;
  @ApiPropertyOptional({ description: '交易發生店家；redeem 屬品牌層為 null' })
  organizationName?: string | null;
  @ApiProperty({
    description: 'earn 為正；redeem、revoke 為負；adjust 正負皆可',
  })
  points: number;
  @ApiProperty({ enum: pointTransactionTypeEnum.enumValues })
  type: PointTransactionType;
}

export class OrganizationPointTransactionDto {
  @ApiProperty() id: string;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional() expiresAt: Date | null;
  @ApiPropertyOptional() orderId: string | null;
  @ApiPropertyOptional() orderNumber: string | null;
  @ApiPropertyOptional({ description: 'adjust 的調整原因' })
  note: string | null;
  @ApiProperty({ description: 'earn 為正、revoke 為負，adjust 正負皆可' })
  points: number;
  @ApiProperty({ description: '尚未被兌換、收回或扣除的點數' })
  remainingPoints: number;
  @ApiProperty({ enum: pointTransactionTypeEnum.enumValues })
  type: PointTransactionType;
  @ApiProperty() userEmail: string;
  @ApiProperty() userName: string;
}

export class OrganizationPointTransactionListResponseDto {
  @ApiProperty({ type: [OrganizationPointTransactionDto] })
  data: OrganizationPointTransactionDto[];
  @ApiProperty() total: number;
}

export class ExpiringPointsDto {
  @ApiProperty({ description: '當天（台灣時間）最早到期的時間' })
  expiresAt: Date;
  @ApiProperty({
    description:
      '當天（台灣時間）到期的剩餘點數，已扣除同日收回的點數，合計不超過餘額',
  })
  points: number;
}

export class MyPointsDto {
  @ApiProperty({ description: '全店家合併餘額' }) balance: number;
  @ApiProperty({
    description:
      '今天起 30 天內（台灣日期）到期的剩餘點數，依到期日分組，由近到遠',
    type: [ExpiringPointsDto],
  })
  expiringSoon: ExpiringPointsDto[];
  @ApiProperty({ type: [PointsCouponDto] })
  redeemableCoupons: PointsCouponDto[];
  @ApiProperty({ type: [PointTransactionDto] })
  transactions: PointTransactionDto[];
  @ApiProperty({ description: '明細總筆數' }) transactionsTotal: number;
}

export class PointAdjustmentLimitDto {
  @ApiProperty({ description: '點數是否已啟用；未啟用時無法補點或扣點' })
  enabled: boolean;
  @ApiProperty({
    description:
      '非 owner 單筆可補扣的最大點數（NT$3,000 依每點金額換算）；超過只有 owner 能做，0 = 只有 owner 能調整',
  })
  ownerOnlyAbovePoints: number;
}
