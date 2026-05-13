import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PaginationQueryDto {
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

  @IsOptional()
  @IsIn(['name', 'description'])
  filterField?: 'name' | 'description';

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

  @IsOptional()
  @IsString()
  filterValue?: string;

  @IsOptional()
  @IsIn(['name', 'description'])
  searchField?: 'name' | 'description';

  @IsOptional()
  @IsIn(['contains', 'starts_with', 'ends_with'])
  searchOperator?: 'contains' | 'starts_with' | 'ends_with';

  @IsOptional()
  @IsString()
  searchValue?: string;

  @IsOptional()
  @IsIn(['name', 'createdAt', 'updatedAt'])
  sortBy?: 'name' | 'createdAt' | 'updatedAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc';
}
