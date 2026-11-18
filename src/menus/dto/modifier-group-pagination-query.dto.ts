import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const MODIFIER_GROUP_STRING_FILTER_FIELDS = ['displayName'] as const;
export const MODIFIER_GROUP_NUMBER_FILTER_FIELDS = [
  'minSelectionCount',
  'maxSelectionCount',
] as const;
export const MODIFIER_GROUP_DATE_FILTER_FIELDS = [
  'createdAt',
  'updatedAt',
] as const;
const MODIFIER_GROUP_ALL_FILTER_FIELDS = [
  ...MODIFIER_GROUP_STRING_FILTER_FIELDS,
  ...MODIFIER_GROUP_NUMBER_FILTER_FIELDS,
  ...MODIFIER_GROUP_DATE_FILTER_FIELDS,
] as const;

const MODIFIER_GROUP_SORT_FIELDS = MODIFIER_GROUP_ALL_FILTER_FIELDS;

type ModifierGroupFilterField =
  (typeof MODIFIER_GROUP_ALL_FILTER_FIELDS)[number];
type ModifierGroupSortField = (typeof MODIFIER_GROUP_SORT_FIELDS)[number];

export class ModifierGroupPaginationQueryDto extends OmitType(
  PaginationQueryDto,
  ['quickFilterEnums'] as const,
) {
  @ApiPropertyOptional({
    enum: MODIFIER_GROUP_ALL_FILTER_FIELDS,
    enumName: 'ModifierGroupFilterField',
  })
  @IsOptional()
  @IsIn(MODIFIER_GROUP_ALL_FILTER_FIELDS)
  filterField?: ModifierGroupFilterField;

  @ApiPropertyOptional({
    enum: MODIFIER_GROUP_SORT_FIELDS,
    enumName: 'ModifierGroupSortField',
  })
  @IsOptional()
  @IsIn(MODIFIER_GROUP_SORT_FIELDS)
  sortBy?: ModifierGroupSortField;
}
