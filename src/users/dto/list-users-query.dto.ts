import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const TEXT_FILTER_OPERATORS = [
  'contains',
  'doesNotContain',
  'equals',
  'doesNotEqual',
  'startsWith',
  'endsWith',
  'isEmpty',
  'isNotEmpty',
  'isAnyOf',
] as const;

export const ENUM_FILTER_OPERATORS = ['is', 'not', 'isAnyOf'] as const;

export const ALL_FILTER_OPERATORS = [
  'contains',
  'doesNotContain',
  'equals',
  'doesNotEqual',
  'startsWith',
  'endsWith',
  'isEmpty',
  'isNotEmpty',
  'is',
  'not',
  'isAnyOf',
] as const;

export type TextFilterOperator = (typeof TEXT_FILTER_OPERATORS)[number];
export type EnumFilterOperator = (typeof ENUM_FILTER_OPERATORS)[number];
export type FilterOperator = (typeof ALL_FILTER_OPERATORS)[number];

export const STRING_FILTER_FIELDS = ['name', 'email'] as const;
export const ENUM_FILTER_FIELDS = ['role'] as const;
export const BOOLEAN_FILTER_FIELDS = ['banned', 'emailSubscribed'] as const;
export const ALL_FILTER_FIELDS = [
  ...STRING_FILTER_FIELDS,
  ...ENUM_FILTER_FIELDS,
  ...BOOLEAN_FILTER_FIELDS,
] as const;

export type StringFilterField = (typeof STRING_FILTER_FIELDS)[number];
export type EnumFilterField = (typeof ENUM_FILTER_FIELDS)[number];
export type BooleanFilterField = (typeof BOOLEAN_FILTER_FIELDS)[number];
export type FilterField = (typeof ALL_FILTER_FIELDS)[number];

export const SEARCH_OPERATORS = ['contains', 'startsWith', 'endsWith'] as const;
export type SearchOperator = (typeof SEARCH_OPERATORS)[number];

export const SORT_FIELDS = ['name', 'email', 'role', 'createdAt'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export class ListUsersQueryDto {
  @ApiPropertyOptional({
    description: 'Column filter 欄位',
    enum: ALL_FILTER_FIELDS,
  })
  @IsOptional()
  @IsIn(ALL_FILTER_FIELDS)
  filterField?: FilterField;

  @ApiPropertyOptional({
    description: 'Column filter 運算子',
    enum: ALL_FILTER_OPERATORS,
  })
  @IsOptional()
  @IsIn(ALL_FILTER_OPERATORS)
  filterOperator?: FilterOperator;

  @ApiPropertyOptional({
    description:
      'Column filter 值（isEmpty/isNotEmpty 時可省略，isAnyOf 時以逗號分隔多值）',
  })
  @IsOptional()
  @IsString()
  filterValue?: string;

  @ApiPropertyOptional({ description: '每頁筆數', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ description: '偏移量', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({
    description:
      'Quick Filter 搜尋值。可傳一般文字，或 role:admin、banned:true、emailSubscribed:false 等欄位 token',
  })
  @IsOptional()
  @IsString()
  quickFilterValue?: string;

  @ApiPropertyOptional({
    description: 'Search 欄位',
    enum: STRING_FILTER_FIELDS,
  })
  @IsOptional()
  @IsIn(STRING_FILTER_FIELDS)
  searchField?: StringFilterField;

  @ApiPropertyOptional({
    description: 'Search 運算子',
    enum: SEARCH_OPERATORS,
  })
  @IsOptional()
  @IsIn(SEARCH_OPERATORS)
  searchOperator?: SearchOperator;

  @ApiPropertyOptional({ description: 'Search 值' })
  @IsOptional()
  @IsString()
  searchValue?: string;

  @ApiPropertyOptional({
    description: '排序欄位',
    enum: SORT_FIELDS,
  })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: SortField;

  @ApiPropertyOptional({ description: '排序方向', enum: SORT_DIRECTIONS })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDirection?: SortDirection;

  @ApiPropertyOptional({
    description: '時區，用於 createdAt 本地時間比對，例如 Asia/Taipei',
  })
  @IsOptional()
  @IsString()
  timezone?: string;
}
