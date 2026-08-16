import { ApiPropertyOptional } from '@nestjs/swagger';

import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

import {
  FILTER_OPERATORS,
  SORT_DIRECTIONS,
  type FilterOperator,
  type SortDirection,
} from 'src/common/constants/pagination';
import { auditResourceEnum, type AuditResource } from 'src/db/schema/audit';

export const AUDIT_LOG_STRING_FILTER_FIELDS = [
  'actorName',
  'actorEmail',
  'resourceId',
] as const;
export const AUDIT_LOG_ENUM_FILTER_FIELDS = ['resource', 'action'] as const;
export const AUDIT_LOG_DATE_FILTER_FIELDS = ['createdAt'] as const;
export const AUDIT_LOG_ALL_FILTER_FIELDS = [
  ...AUDIT_LOG_STRING_FILTER_FIELDS,
  ...AUDIT_LOG_ENUM_FILTER_FIELDS,
  ...AUDIT_LOG_DATE_FILTER_FIELDS,
] as const;

export type AuditLogFilterField = (typeof AUDIT_LOG_ALL_FILTER_FIELDS)[number];

export const AUDIT_LOG_SORT_FIELDS = [
  'actorName',
  'resource',
  'action',
  'createdAt',
] as const;

export type AuditLogSortField = (typeof AUDIT_LOG_SORT_FIELDS)[number];

export class AuditLogPaginationQueryDto {
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
    enum: auditResourceEnum.enumValues,
    enumName: 'AuditResource',
  })
  @IsOptional()
  @IsIn(auditResourceEnum.enumValues)
  resource?: AuditResource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiPropertyOptional({
    description: '篩出祖先含此 id 的紀錄,例如某張券的所有發放',
  })
  @IsOptional()
  @IsString()
  ancestorId?: string;

  @ApiPropertyOptional({
    enum: AUDIT_LOG_ALL_FILTER_FIELDS,
    enumName: 'AuditLogFilterField',
  })
  @IsOptional()
  @IsIn(AUDIT_LOG_ALL_FILTER_FIELDS)
  filterField?: AuditLogFilterField;

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
    enum: AUDIT_LOG_SORT_FIELDS,
    enumName: 'AuditLogSortField',
  })
  @IsOptional()
  @IsIn(AUDIT_LOG_SORT_FIELDS)
  sortBy?: AuditLogSortField;

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, enumName: 'SortDirection' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDirection?: SortDirection;
}
