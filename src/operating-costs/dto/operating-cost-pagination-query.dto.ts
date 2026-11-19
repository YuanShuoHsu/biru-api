import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const OPERATING_COST_STRING_FILTER_FIELDS = ['note'] as const;
export const OPERATING_COST_ENUM_FILTER_FIELDS = ['category'] as const;
export const OPERATING_COST_NUMBER_FILTER_FIELDS = ['monthlyAmount'] as const;
export const OPERATING_COST_MONTH_FILTER_FIELDS = ['effectiveFrom'] as const;
export const OPERATING_COST_DATE_FILTER_FIELDS = [
  'createdAt',
  'updatedAt',
] as const;
const OPERATING_COST_FILTER_FIELDS = [
  ...OPERATING_COST_ENUM_FILTER_FIELDS,
  ...OPERATING_COST_MONTH_FILTER_FIELDS,
  ...OPERATING_COST_NUMBER_FILTER_FIELDS,
  ...OPERATING_COST_STRING_FILTER_FIELDS,
  ...OPERATING_COST_DATE_FILTER_FIELDS,
] as const;

type OperatingCostFilterField = (typeof OPERATING_COST_FILTER_FIELDS)[number];

const OPERATING_COST_SORT_FIELDS = OPERATING_COST_FILTER_FIELDS;

type OperatingCostSortField = (typeof OPERATING_COST_SORT_FIELDS)[number];

export class OperatingCostPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: OPERATING_COST_FILTER_FIELDS,
    enumName: 'OperatingCostFilterField',
  })
  @IsOptional()
  @IsIn(OPERATING_COST_FILTER_FIELDS)
  filterField?: OperatingCostFilterField;

  @ApiPropertyOptional({
    enum: OPERATING_COST_SORT_FIELDS,
    enumName: 'OperatingCostSortField',
    description: '省略時依生效月份新到舊、再依類別排序',
  })
  @IsOptional()
  @IsIn(OPERATING_COST_SORT_FIELDS)
  sortBy?: OperatingCostSortField;
}
