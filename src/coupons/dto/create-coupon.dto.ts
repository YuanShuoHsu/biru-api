import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import {
  couponDiscountTypeEnum,
  couponIssueTriggerEnum,
  couponScopeEnum,
  type CouponDiscountType,
  type CouponIssueTrigger,
  type CouponScope,
} from 'src/db/schema/coupons';

export class CreateCouponDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  code: string;

  @ApiPropertyOptional({
    description: '幣別（ISO 4217），未帶時預設 TWD；應與店家菜單幣別一致',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  discountCurrency?: string;

  @ApiProperty({ enum: couponDiscountTypeEnum.enumValues })
  @IsEnum(couponDiscountTypeEnum.enumValues)
  discountType: CouponDiscountType;

  @ApiProperty({
    description: 'fixed: 折抵金額；percentage: 折扣百分比（0 < value ≤ 100）',
  })
  @IsNumber()
  @Min(0.01)
  discountValue: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '會員可於店家頁領取進錢包' })
  @IsOptional()
  @IsBoolean()
  isClaimable?: boolean;

  @ApiPropertyOptional({ description: '結帳頁對所有人（含訪客）顯示' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'issueTrigger=spend 的單筆滿額門檻' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  issueMinSpend?: number;

  @ApiPropertyOptional({
    description: '自動發放觸發：signup 註冊禮／birthday 生日月／spend 單筆滿額',
    enum: couponIssueTriggerEnum.enumValues,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(couponIssueTriggerEnum.enumValues)
  issueTrigger?: CouponIssueTrigger | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menuItemIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menuSectionIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minSubtotal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  @ApiPropertyOptional({ enum: couponScopeEnum.enumValues })
  @IsOptional()
  @IsEnum(couponScopeEnum.enumValues)
  scope?: CouponScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  totalLimit?: number;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  validUntil?: string | null;
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}
