import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';

import { IsIn, IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const MENU_SECTION_STRING_FILTER_FIELDS = [
  'name',
  'description',
] as const;
export const MENU_SECTION_DATE_FILTER_FIELDS = [
  'createdAt',
  'updatedAt',
] as const;
const MENU_SECTION_ALL_FILTER_FIELDS = [
  ...MENU_SECTION_STRING_FILTER_FIELDS,
  ...MENU_SECTION_DATE_FILTER_FIELDS,
] as const;

export const MENU_SECTION_SEARCH_FIELDS = ['name', 'description'] as const;
export const MENU_SECTION_SEARCH_OPERATORS = [
  'contains',
  'startsWith',
  'endsWith',
] as const;

const MENU_SECTION_SORT_FIELDS = MENU_SECTION_ALL_FILTER_FIELDS;

type MenuSectionFilterField = (typeof MENU_SECTION_ALL_FILTER_FIELDS)[number];
type MenuSectionSortField = (typeof MENU_SECTION_SORT_FIELDS)[number];

export class MenuSectionPaginationQueryDto extends OmitType(
  PaginationQueryDto,
  ['quickFilterEnums'] as const,
) {
  @ApiPropertyOptional({
    enum: MENU_SECTION_ALL_FILTER_FIELDS,
    enumName: 'MenuSectionFilterField',
  })
  @IsOptional()
  @IsIn(MENU_SECTION_ALL_FILTER_FIELDS)
  filterField?: MenuSectionFilterField;

  @IsOptional()
  @IsIn(MENU_SECTION_SEARCH_FIELDS)
  searchField?: (typeof MENU_SECTION_SEARCH_FIELDS)[number];

  @IsOptional()
  @IsIn(MENU_SECTION_SEARCH_OPERATORS)
  searchOperator?: (typeof MENU_SECTION_SEARCH_OPERATORS)[number];

  @IsOptional()
  @IsString()
  searchValue?: string;

  @ApiPropertyOptional({
    enum: MENU_SECTION_SORT_FIELDS,
    enumName: 'MenuSectionSortField',
  })
  @IsOptional()
  @IsIn(MENU_SECTION_SORT_FIELDS)
  sortBy?: MenuSectionSortField;
}
