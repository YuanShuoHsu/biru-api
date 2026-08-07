import { ApiPropertyOptional } from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

import {
  FILTER_OPERATORS,
  SORT_DIRECTIONS,
  type FilterOperator,
  type SortDirection,
} from 'src/common/constants/pagination';

export const MODIFIER_STRING_FILTER_FIELDS = ['displayName'] as const;
export const MODIFIER_NUMBER_FILTER_FIELDS = ['priceAdjustment'] as const;
export const MODIFIER_ENUM_FILTER_FIELDS = ['availability'] as const;
export const MODIFIER_ARRAY_ENUM_FILTER_FIELDS = ['availableModes'] as const;
export const MODIFIER_DATE_FILTER_FIELDS = ['createdAt', 'updatedAt'] as const;
export const MODIFIER_ALL_FILTER_FIELDS = [
  ...MODIFIER_STRING_FILTER_FIELDS,
  ...MODIFIER_NUMBER_FILTER_FIELDS,
  ...MODIFIER_ENUM_FILTER_FIELDS,
  ...MODIFIER_ARRAY_ENUM_FILTER_FIELDS,
  ...MODIFIER_DATE_FILTER_FIELDS,
] as const;

export const MODIFIER_QUICK_FILTER_ENUM_FIELDS = ['availability'] as const;

export const MODIFIER_SORT_FIELDS = [
  ...MODIFIER_STRING_FILTER_FIELDS,
  ...MODIFIER_NUMBER_FILTER_FIELDS,
  ...MODIFIER_ENUM_FILTER_FIELDS,
  ...MODIFIER_DATE_FILTER_FIELDS,
] as const;

export type ModifierFilterField = (typeof MODIFIER_ALL_FILTER_FIELDS)[number];
export type ModifierSortField = (typeof MODIFIER_SORT_FIELDS)[number];

export class ModifierPaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({
    enum: MODIFIER_ALL_FILTER_FIELDS,
    enumName: 'ModifierFilterField',
  })
  @IsOptional()
  @IsIn(MODIFIER_ALL_FILTER_FIELDS)
  filterField?: ModifierFilterField;

  @ApiPropertyOptional({
    enum: FILTER_OPERATORS,
    enumName: 'FilterOperator',
  })
  @IsOptional()
  @IsIn(FILTER_OPERATORS)
  filterOperator?: FilterOperator;

  @IsOptional()
  @IsString()
  filterValue?: string;

  @IsOptional()
  @IsString()
  quickFilterValue?: string;

  @ApiPropertyOptional({
    description: '快速搜尋命中的列舉條件,格式為 field:value1,value2',
    isArray: true,
    type: String,
  })
  @IsOptional()
  @Transform(({ value }: { value: string | string[] }) =>
    Array.isArray(value) ? value : [value],
  )
  @IsString({ each: true })
  quickFilterEnums?: string[];

  @ApiPropertyOptional({
    enum: MODIFIER_SORT_FIELDS,
    enumName: 'ModifierSortField',
  })
  @IsOptional()
  @IsIn(MODIFIER_SORT_FIELDS)
  sortBy?: ModifierSortField;

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, enumName: 'SortDirection' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDirection?: SortDirection;
}
