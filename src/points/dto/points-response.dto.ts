import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsString } from 'class-validator';
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
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional() expiresAt?: Date | null;
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
}

export class RedeemPointsDto {
  @ApiProperty()
  @IsString()
  couponId: string;
}
