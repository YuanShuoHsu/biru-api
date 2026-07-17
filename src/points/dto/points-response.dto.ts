import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  pointTransactionTypeEnum,
  type PointTransactionType,
} from 'src/db/schema/points';

import { CustomerCouponDto } from '../../coupons/dto/coupon-response.dto';

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
  @ApiProperty({ description: 'earn 為正、redeem 為負' }) points: number;
  @ApiProperty({ enum: pointTransactionTypeEnum.enumValues })
  type: PointTransactionType;
}

export class MyPointsDto {
  @ApiProperty({ description: '全店家合併餘額' }) balance: number;
  @ApiProperty({ type: [PointsCouponDto] })
  redeemableCoupons: PointsCouponDto[];
  @ApiProperty({ type: [PointTransactionDto] })
  transactions: PointTransactionDto[];
  @ApiProperty({ description: '明細總筆數' }) transactionsTotal: number;
}
