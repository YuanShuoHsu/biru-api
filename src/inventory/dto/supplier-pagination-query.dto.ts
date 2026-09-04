import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const SUPPLIER_STRING_FILTER_FIELDS = [
  'name',
  'telephone',
  'url',
  'note',
] as const;
export const SUPPLIER_DATE_FILTER_FIELDS = ['createdAt', 'updatedAt'] as const;
export const SUPPLIER_ALL_FILTER_FIELDS = [
  ...SUPPLIER_STRING_FILTER_FIELDS,
  ...SUPPLIER_DATE_FILTER_FIELDS,
] as const;

export type SupplierFilterField = (typeof SUPPLIER_ALL_FILTER_FIELDS)[number];

export const SUPPLIER_SORT_FIELDS = SUPPLIER_ALL_FILTER_FIELDS;

export type SupplierSortField = (typeof SUPPLIER_SORT_FIELDS)[number];

export class SupplierPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: SUPPLIER_ALL_FILTER_FIELDS,
    enumName: 'SupplierFilterField',
  })
  @IsOptional()
  @IsIn(SUPPLIER_ALL_FILTER_FIELDS)
  filterField?: SupplierFilterField;

  @ApiPropertyOptional({
    enum: SUPPLIER_SORT_FIELDS,
    enumName: 'SupplierSortField',
  })
  @IsOptional()
  @IsIn(SUPPLIER_SORT_FIELDS)
  sortBy?: SupplierSortField;
}
