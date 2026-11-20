import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  IsBoolean,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { trim } from '../../common/utils/trim.js';
import {
  operatingCostCategoryEnum,
  type OperatingCostCategory,
} from '../../db/schema/operating-costs.js';

export const MONTH_PATTERN = /^20\d{2}-(0[1-9]|1[0-2])$/;

export class CreateOperatingCostDto {
  @ApiProperty({
    enum: operatingCostCategoryEnum.enumValues,
    enumName: 'OperatingCostCategory',
    description: 'personnel 是人事成本的預估，只用在該月沒有任何已發布薪資單時',
  })
  @IsIn(operatingCostCategoryEnum.enumValues)
  category: OperatingCostCategory;

  @ApiProperty({
    example: '2026-12',
    description: '自這個月起每月沿用，直到同類別有更晚的生效月份',
  })
  @Matches(MONTH_PATTERN)
  effectiveFrom: string;

  @ApiProperty({
    example: '60000.00',
    description: '每月金額（含稅）；0 表示自生效月份起不再有這項成本',
  })
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  @IsNumberString()
  monthlyAmount: string;

  @ApiProperty({
    description:
      '這筆成本有開給本店的統一發票，5% 進項稅可扣抵，損益平衡以未稅金額計算；人事不能為 true',
  })
  @IsBoolean()
  inputTaxDeductible: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(200)
  note?: string | null;
}

export class UpdateOperatingCostDto extends PartialType(
  CreateOperatingCostDto,
  { skipNullProperties: false },
) {}

export class OperatingCostResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty({
    enum: operatingCostCategoryEnum.enumValues,
    enumName: 'OperatingCostCategory',
  })
  category: OperatingCostCategory;
  @ApiProperty() effectiveFrom: string;
  @ApiProperty() monthlyAmount: string;
  @ApiProperty() inputTaxDeductible: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) note: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class OperatingCostListResponseDto {
  @ApiProperty({ type: [OperatingCostResponseDto] })
  data: OperatingCostResponseDto[];
  @ApiProperty() total: number;
}
