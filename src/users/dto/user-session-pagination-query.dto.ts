import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const USER_SESSION_STRING_FILTER_FIELDS = [
  'userAgent',
  'ipAddress',
] as const;
export const USER_SESSION_DATE_FILTER_FIELDS = [
  'createdAt',
  'expiresAt',
] as const;
export const USER_SESSION_ALL_FILTER_FIELDS = [
  ...USER_SESSION_STRING_FILTER_FIELDS,
  ...USER_SESSION_DATE_FILTER_FIELDS,
] as const;

export type UserSessionFilterField =
  (typeof USER_SESSION_ALL_FILTER_FIELDS)[number];

export const USER_SESSION_SORT_FIELDS = [
  'userAgent',
  'ipAddress',
  'createdAt',
  'expiresAt',
] as const;

export type UserSessionSortField = (typeof USER_SESSION_SORT_FIELDS)[number];

export class UserSessionPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: USER_SESSION_ALL_FILTER_FIELDS,
    enumName: 'UserSessionFilterField',
  })
  @IsOptional()
  @IsIn(USER_SESSION_ALL_FILTER_FIELDS)
  filterField?: UserSessionFilterField;

  @ApiPropertyOptional({
    enum: USER_SESSION_SORT_FIELDS,
    enumName: 'UserSessionSortField',
  })
  @IsOptional()
  @IsIn(USER_SESSION_SORT_FIELDS)
  sortBy?: UserSessionSortField;
}
