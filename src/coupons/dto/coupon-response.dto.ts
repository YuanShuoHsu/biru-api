import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  couponDiscountTypeEnum,
  couponIssueTriggerEnum,
  couponScopeEnum,
  userCouponSourceEnum,
  type CouponDiscountType,
  type CouponIssueTrigger,
  type CouponScope,
  type UserCouponSource,
} from 'src/db/schema/coupons';

export class CouponResponseDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional({ nullable: true, type: [String] })
  applicableOrganizationIds?: string[] | null;
  @ApiProperty() code: string;
  @ApiProperty() discountCurrency: string;
  @ApiProperty({ enum: couponDiscountTypeEnum.enumValues })
  discountType: CouponDiscountType;
  @ApiProperty() discountValue: string;
  @ApiProperty() isActive: boolean;
  @ApiProperty() isClaimable: boolean;
  @ApiProperty() isPublic: boolean;
  @ApiPropertyOptional() issueMinSpend?: string | null;
  @ApiPropertyOptional({
    enum: couponIssueTriggerEnum.enumValues,
    nullable: true,
  })
  issueTrigger?: CouponIssueTrigger | null;
  @ApiPropertyOptional({ type: [String] }) menuItemIds?: string[] | null;
  @ApiPropertyOptional({
    description: '指定品項的名稱清單（依 menuItemIds 順序，管理列表顯示用）',
    nullable: true,
    type: [String],
  })
  menuItemNames?: string[] | null;
  @ApiPropertyOptional({ type: [String] }) menuSectionIds?: string[] | null;
  @ApiPropertyOptional({
    description: '指定分類的名稱清單（依 menuSectionIds 順序，管理列表顯示用）',
    nullable: true,
    type: [String],
  })
  menuSectionNames?: string[] | null;
  @ApiPropertyOptional() minSubtotal?: string | null;
  @ApiPropertyOptional() perUserLimit?: number | null;
  @ApiPropertyOptional() pointsCost?: number | null;
  @ApiProperty({ enum: couponScopeEnum.enumValues }) scope: CouponScope;
  @ApiPropertyOptional() totalLimit?: number | null;
  @ApiProperty() usedCount: number;
  @ApiPropertyOptional() validFrom?: Date | null;
  @ApiPropertyOptional() validThrough?: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class CustomerCouponDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() discountCurrency: string;
  @ApiProperty({ enum: couponDiscountTypeEnum.enumValues })
  discountType: CouponDiscountType;
  @ApiProperty() discountValue: string;
  @ApiPropertyOptional() minSubtotal?: string | null;
  @ApiProperty({ enum: couponScopeEnum.enumValues }) scope: CouponScope;
  @ApiPropertyOptional() validFrom?: Date | null;
  @ApiPropertyOptional() validThrough?: Date | null;
  @ApiProperty() isActive: boolean;
}

export class AvailableCouponDto extends CustomerCouponDto {
  @ApiPropertyOptional({ nullable: true }) userCouponId: string | null;
}

export class ClaimableCouponDto extends CustomerCouponDto {
  @ApiProperty({ description: '目前登入者是否已領取' }) claimed: boolean;
}

export class UserCouponResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: CustomerCouponDto }) coupon: CustomerCouponDto;
  @ApiProperty({ enum: userCouponSourceEnum.enumValues })
  source: UserCouponSource;
  @ApiPropertyOptional() usedAt?: Date | null;
  @ApiProperty() createdAt: Date;
}

export class MyCouponResponseDto extends UserCouponResponseDto {
  @ApiPropertyOptional({
    description: '限定店家的店名清單；null = 全部店家通用',
    nullable: true,
    type: [String],
  })
  applicableOrganizationNames?: string[] | null;
  @ApiPropertyOptional({
    description: '限定店家的 slug 清單；null = 全部店家通用',
    nullable: true,
    type: [String],
  })
  applicableOrganizationSlugs?: string[] | null;
}

export class MyClaimableCouponDto extends CustomerCouponDto {
  @ApiPropertyOptional({
    description: '限定店家的店名清單；null = 全部店家通用',
    nullable: true,
    type: [String],
  })
  applicableOrganizationNames?: string[] | null;
  @ApiPropertyOptional({
    description: '限定店家的 slug 清單；null = 全部店家通用',
    nullable: true,
    type: [String],
  })
  applicableOrganizationSlugs?: string[] | null;
}
