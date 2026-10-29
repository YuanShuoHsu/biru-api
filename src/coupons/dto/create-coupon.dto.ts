import { Transform } from 'class-transformer';
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
  Matches,
  MaxLength,
  Min,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import { CURRENCY_REGEX } from '../../common/utils/currency.js';
import {
  couponDiscountTypeEnum,
  couponIssueTriggerEnum,
  couponScopeEnum,
  type CouponDiscountType,
  type CouponIssueTrigger,
  type CouponScope,
} from '../../db/schema/coupons.js';
import { trim } from '../../common/utils/trim.js';

export class CreateCouponDto {
  @ApiPropertyOptional({
    description: '適用店家；null = 全部店家通用，發行店永遠視為適用',
    nullable: true,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableOrganizationIds?: string[] | null;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  @Transform(trim)
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({
    description:
      '幣別（ISO 4217）；限定單一店家時一律採用該店設定，此欄只對跨店與全平台券生效',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(CURRENCY_REGEX)
  discountCurrency?: string;

  @ApiProperty({
    enum: couponDiscountTypeEnum.enumValues,
    enumName: 'CouponDiscountType',
  })
  @IsEnum(couponDiscountTypeEnum.enumValues)
  discountType: CouponDiscountType;

  @ApiProperty({
    description: 'fixed: 折抵金額；percentage: 折扣百分比（0 < value ≤ 100）',
  })
  @IsNumber()
  @Min(0.01)
  discountValue: number;

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '會員可於店家頁領取進錢包' })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isClaimable?: boolean;

  @ApiPropertyOptional({ description: '結帳頁對所有人（含訪客）顯示' })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'issueTrigger=spend 的單筆滿額門檻' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  issueMinSpend?: number;

  @ApiPropertyOptional({
    enum: couponIssueTriggerEnum.enumValues,
    enumName: 'CouponIssueTrigger',
    // description 放在具名 schema 上；留在屬性層會讓 openapi-typescript
    // 把 $ref 展開成 inline union,前端就拿不到共用的 enum 常數
    enumSchema: {
      description:
        '自動發放觸發：signup 註冊禮／birthday 生日月／spend 單筆滿額',
    },
    nullable: true,
  })
  @IsOptional()
  @IsEnum(couponIssueTriggerEnum.enumValues)
  issueTrigger?: CouponIssueTrigger | null;

  @ApiPropertyOptional({ type: [String] })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  menuItemIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  menuSectionIds?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minSubtotal?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number | null;

  @ApiPropertyOptional({
    description: '兌換所需點數；null = 不可用點數兌換',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  pointsCost?: number | null;

  @ApiPropertyOptional({
    enum: couponScopeEnum.enumValues,
    enumName: 'CouponScope',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(couponScopeEnum.enumValues)
  scope?: CouponScope;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  totalLimit?: number | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  validThrough?: string | null;
}

export class UpdateCouponDto extends PartialType(CreateCouponDto, {
  skipNullProperties: false,
}) {}
