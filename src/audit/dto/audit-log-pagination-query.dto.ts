import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

import {
  AUDIT_LOG_RESOURCES,
  type AuditLogResource,
} from './audit-log-response.dto.js';

export const AUDIT_LOG_STRING_FILTER_FIELDS = [
  'actorName',
  'actorEmail',
  'resourceId',
] as const;
export const PLATFORM_ORGANIZATION_ID = 'platform';

export const AUDIT_LOG_ENUM_FILTER_FIELDS = [
  'organizationId',
  'resource',
  'action',
] as const;
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

export class AuditLogPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AUDIT_LOG_RESOURCES, enumName: 'AuditResource' })
  @IsOptional()
  @IsIn(AUDIT_LOG_RESOURCES)
  resource?: AuditLogResource;

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
    enum: AUDIT_LOG_SORT_FIELDS,
    enumName: 'AuditLogSortField',
  })
  @IsOptional()
  @IsIn(AUDIT_LOG_SORT_FIELDS)
  sortBy?: AuditLogSortField;
}
