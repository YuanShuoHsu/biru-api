import { ApiPropertyOptional } from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

import {
  FILTER_OPERATORS,
  SORT_DIRECTIONS,
  type FilterOperator,
  type SortDirection,
} from 'src/common/constants/pagination';

export const ORDER_STRING_FILTER_FIELDS = [
  'orderNumber',
  'confirmationNumber',
  'customerName',
] as const;
export const ORDER_ENUM_FILTER_FIELDS = [
  'mode',
  'paymentMethod',
  'orderStatus',
] as const;
export const ORDER_DATE_FILTER_FIELDS = ['paymentDate', 'createdAt'] as const;
export const ORDER_NUMBER_FILTER_FIELDS = ['tableNumber', 'total'] as const;
export const ORDER_ALL_FILTER_FIELDS = [
  ...ORDER_STRING_FILTER_FIELDS,
  ...ORDER_ENUM_FILTER_FIELDS,
  ...ORDER_DATE_FILTER_FIELDS,
  ...ORDER_NUMBER_FILTER_FIELDS,
] as const;

export type OrderFilterField = (typeof ORDER_ALL_FILTER_FIELDS)[number];

export const ORDER_SORT_FIELDS = [
  'orderNumber',
  'mode',
  'paymentMethod',
  'orderStatus',
  'paymentDate',
  'createdAt',
  'tableNumber',
  'total',
] as const;

export type OrderSortField = (typeof ORDER_SORT_FIELDS)[number];

export class OrderPaginationQueryDto {
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
    enum: ORDER_ALL_FILTER_FIELDS,
    enumName: 'OrderFilterField',
  })
  @IsOptional()
  @IsIn(ORDER_ALL_FILTER_FIELDS)
  filterField?: OrderFilterField;

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

  @ApiPropertyOptional({ enum: ORDER_SORT_FIELDS, enumName: 'OrderSortField' })
  @IsOptional()
  @IsIn(ORDER_SORT_FIELDS)
  sortBy?: OrderSortField;

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, enumName: 'SortDirection' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDirection?: SortDirection;
}
