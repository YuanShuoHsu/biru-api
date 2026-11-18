import { ApiPropertyOptional } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const MENU_ITEM_STRING_FILTER_FIELDS = [
  'name',
  'description',
  'recipe',
] as const;
export const MENU_ITEM_NUMBER_FILTER_FIELDS = [
  'price',
  'inventoryLevel',
  'deliveryLeadTimeMinutes',
  'priceSpecification',
] as const;
export const MENU_ITEM_ENUM_FILTER_FIELDS = [
  'availability',
  'sweetness',
] as const;
export const MENU_ITEM_ARRAY_ENUM_FILTER_FIELDS = [
  'availableModes',
  'servingTemperatures',
] as const;
export const MENU_ITEM_DATE_FILTER_FIELDS = ['createdAt', 'updatedAt'] as const;
export const MENU_ITEM_PLAIN_DATE_FILTER_FIELDS = [
  'priceSpecificationValidFrom',
  'priceSpecificationValidThrough',
] as const;
const MENU_ITEM_ALL_FILTER_FIELDS = [
  ...MENU_ITEM_STRING_FILTER_FIELDS,
  ...MENU_ITEM_NUMBER_FILTER_FIELDS,
  ...MENU_ITEM_ENUM_FILTER_FIELDS,
  ...MENU_ITEM_ARRAY_ENUM_FILTER_FIELDS,
  ...MENU_ITEM_DATE_FILTER_FIELDS,
  ...MENU_ITEM_PLAIN_DATE_FILTER_FIELDS,
] as const;

export const MENU_ITEM_QUICK_FILTER_ENUM_FIELDS = [
  'availability',
  'sweetness',
] as const;

export const MENU_ITEM_SEARCH_FIELDS = ['name', 'description'] as const;
export const MENU_ITEM_SEARCH_OPERATORS = [
  'contains',
  'startsWith',
  'endsWith',
] as const;

const MENU_ITEM_SORT_FIELDS = [
  ...MENU_ITEM_STRING_FILTER_FIELDS,
  ...MENU_ITEM_NUMBER_FILTER_FIELDS,
  ...MENU_ITEM_ENUM_FILTER_FIELDS,
  'servingTemperatures',
  ...MENU_ITEM_DATE_FILTER_FIELDS,
  ...MENU_ITEM_PLAIN_DATE_FILTER_FIELDS,
] as const;

const dropRemovedField = ({ value }: { value: unknown }) =>
  value === 'priceCurrency' ? undefined : value;

type MenuItemFilterField = (typeof MENU_ITEM_ALL_FILTER_FIELDS)[number];
type MenuItemSortField = (typeof MENU_ITEM_SORT_FIELDS)[number];

export class MenuItemPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: MENU_ITEM_ALL_FILTER_FIELDS,
    enumName: 'MenuItemFilterField',
  })
  @IsOptional()
  @Transform(dropRemovedField)
  @IsIn(MENU_ITEM_ALL_FILTER_FIELDS)
  filterField?: MenuItemFilterField;

  @IsOptional()
  @IsIn(MENU_ITEM_SEARCH_FIELDS)
  searchField?: (typeof MENU_ITEM_SEARCH_FIELDS)[number];

  @IsOptional()
  @IsIn(MENU_ITEM_SEARCH_OPERATORS)
  searchOperator?: (typeof MENU_ITEM_SEARCH_OPERATORS)[number];

  @IsOptional()
  @IsString()
  searchValue?: string;

  @ApiPropertyOptional({
    enum: MENU_ITEM_SORT_FIELDS,
    enumName: 'MenuItemSortField',
  })
  @IsOptional()
  @Transform(dropRemovedField)
  @IsIn(MENU_ITEM_SORT_FIELDS)
  sortBy?: MenuItemSortField;
}
