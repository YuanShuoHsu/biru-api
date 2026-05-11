import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListUsersQueryDto {
  @ApiPropertyOptional({
    description: 'Column filter 欄位',
    enum: ['name', 'email'],
  })
  @IsOptional()
  @IsIn(['name', 'email'])
  filterField?: 'name' | 'email';

  @ApiPropertyOptional({
    description: 'Column filter 運算子',
    enum: [
      'eq',
      'ne',
      'lt',
      'lte',
      'gt',
      'gte',
      'in',
      'not_in',
      'contains',
      'starts_with',
      'ends_with',
    ],
  })
  @IsOptional()
  @IsIn([
    'eq',
    'ne',
    'lt',
    'lte',
    'gt',
    'gte',
    'in',
    'not_in',
    'contains',
    'starts_with',
    'ends_with',
  ])
  filterOperator?:
    | 'eq'
    | 'ne'
    | 'lt'
    | 'lte'
    | 'gt'
    | 'gte'
    | 'in'
    | 'not_in'
    | 'contains'
    | 'starts_with'
    | 'ends_with';

  @ApiPropertyOptional({
    description: 'Column filter 值（in/not_in 用逗號分隔）',
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
    description: 'Quick Filter 搜尋值（前端已完成語系轉換的 DB 值）',
  })
  @IsOptional()
  @IsString()
  quickFilterValue?: string;

  @ApiPropertyOptional({ description: 'Search 欄位', enum: ['name', 'email'] })
  @IsOptional()
  @IsIn(['name', 'email'])
  searchField?: 'name' | 'email';

  @ApiPropertyOptional({
    description: 'Search 運算子',
    enum: ['contains', 'starts_with', 'ends_with'],
  })
  @IsOptional()
  @IsIn(['contains', 'starts_with', 'ends_with'])
  searchOperator?: 'contains' | 'starts_with' | 'ends_with';

  @ApiPropertyOptional({ description: 'Search 值' })
  @IsOptional()
  @IsString()
  searchValue?: string;

  @ApiPropertyOptional({
    description: '排序欄位',
    enum: ['name', 'email', 'createdAt'],
  })
  @IsOptional()
  @IsIn(['name', 'email', 'createdAt'])
  sortBy?: 'name' | 'email' | 'createdAt';

  @ApiPropertyOptional({ description: '排序方向', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc';
}
