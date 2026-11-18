import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const MODIFIER_STRING_FILTER_FIELDS = ['displayName'] as const;
export const MODIFIER_NUMBER_FILTER_FIELDS = ['priceAdjustment'] as const;
export const MODIFIER_ENUM_FILTER_FIELDS = ['availability'] as const;
export const MODIFIER_ARRAY_ENUM_FILTER_FIELDS = ['availableModes'] as const;
export const MODIFIER_DATE_FILTER_FIELDS = ['createdAt', 'updatedAt'] as const;
const MODIFIER_ALL_FILTER_FIELDS = [
  ...MODIFIER_STRING_FILTER_FIELDS,
  ...MODIFIER_NUMBER_FILTER_FIELDS,
  ...MODIFIER_ENUM_FILTER_FIELDS,
  ...MODIFIER_ARRAY_ENUM_FILTER_FIELDS,
  ...MODIFIER_DATE_FILTER_FIELDS,
] as const;

export const MODIFIER_QUICK_FILTER_ENUM_FIELDS = ['availability'] as const;

const MODIFIER_SORT_FIELDS = [
  ...MODIFIER_STRING_FILTER_FIELDS,
  ...MODIFIER_NUMBER_FILTER_FIELDS,
  ...MODIFIER_ENUM_FILTER_FIELDS,
  ...MODIFIER_DATE_FILTER_FIELDS,
] as const;

type ModifierFilterField = (typeof MODIFIER_ALL_FILTER_FIELDS)[number];
type ModifierSortField = (typeof MODIFIER_SORT_FIELDS)[number];

export class ModifierPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: MODIFIER_ALL_FILTER_FIELDS,
    enumName: 'ModifierFilterField',
  })
  @IsOptional()
  @IsIn(MODIFIER_ALL_FILTER_FIELDS)
  filterField?: ModifierFilterField;

  @ApiPropertyOptional({
    enum: MODIFIER_SORT_FIELDS,
    enumName: 'ModifierSortField',
  })
  @IsOptional()
  @IsIn(MODIFIER_SORT_FIELDS)
  sortBy?: ModifierSortField;
}
