import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const ADD_ON_STRING_FILTER_FIELDS = [
  'addOnMenuSectionName',
  'addOnMenuItemName',
] as const;
export const ADD_ON_DATE_FILTER_FIELDS = ['createdAt', 'updatedAt'] as const;
const ADD_ON_ALL_FILTER_FIELDS = [
  ...ADD_ON_STRING_FILTER_FIELDS,
  ...ADD_ON_DATE_FILTER_FIELDS,
] as const;

const ADD_ON_SORT_FIELDS = [
  'addOnMenuSectionName',
  'addOnMenuItemName',
  'createdAt',
  'updatedAt',
] as const;

type AddOnFilterField = (typeof ADD_ON_ALL_FILTER_FIELDS)[number];
type AddOnSortField = (typeof ADD_ON_SORT_FIELDS)[number];

export class AddOnPaginationQueryDto extends OmitType(PaginationQueryDto, [
  'quickFilterEnums',
] as const) {
  @ApiPropertyOptional({
    enum: ADD_ON_ALL_FILTER_FIELDS,
    enumName: 'AddOnFilterField',
  })
  @IsOptional()
  @IsIn(ADD_ON_ALL_FILTER_FIELDS)
  filterField?: AddOnFilterField;

  @ApiPropertyOptional({
    enum: ADD_ON_SORT_FIELDS,
    enumName: 'AddOnSortField',
  })
  @IsOptional()
  @IsIn(ADD_ON_SORT_FIELDS)
  sortBy?: AddOnSortField;
}
