import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  pointTransactionTypeEnum,
  type PointTransactionType,
} from 'src/db/schema/points';

import { CustomerCouponDto } from '../../coupons/dto/coupon-response.dto';

export class PointsCouponDto extends CustomerCouponDto {
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
  @ApiProperty({ description: 'earn 為正、redeem 為負' }) points: number;
  @ApiProperty({ enum: pointTransactionTypeEnum.enumValues })
  type: PointTransactionType;
}

export class MyPointsWalletDto {
  @ApiProperty() balance: number;
  @ApiProperty() organizationName: string;
  @ApiProperty() organizationSlug: string;
  @ApiProperty({ type: [PointsCouponDto] })
  redeemableCoupons: PointsCouponDto[];
  @ApiProperty({ type: [PointTransactionDto] })
  transactions: PointTransactionDto[];
  @ApiProperty({ description: '明細總筆數' }) transactionsTotal: number;
}
