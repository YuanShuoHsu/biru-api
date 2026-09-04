import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const INVENTORY_TRANSACTION_STRING_FILTER_FIELDS = ['note'] as const;
export const INVENTORY_TRANSACTION_ENUM_FILTER_FIELDS = ['type'] as const;
export const INVENTORY_TRANSACTION_NUMBER_FILTER_FIELDS = [
  'quantity',
  'unitCost',
] as const;
export const INVENTORY_TRANSACTION_DATE_FILTER_FIELDS = ['createdAt'] as const;
export const INVENTORY_TRANSACTION_ALL_FILTER_FIELDS = [
  ...INVENTORY_TRANSACTION_STRING_FILTER_FIELDS,
  ...INVENTORY_TRANSACTION_ENUM_FILTER_FIELDS,
  ...INVENTORY_TRANSACTION_NUMBER_FILTER_FIELDS,
  ...INVENTORY_TRANSACTION_DATE_FILTER_FIELDS,
] as const;

export type InventoryTransactionFilterField =
  (typeof INVENTORY_TRANSACTION_ALL_FILTER_FIELDS)[number];

export const INVENTORY_TRANSACTION_SORT_FIELDS =
  INVENTORY_TRANSACTION_ALL_FILTER_FIELDS;

export type InventoryTransactionSortField =
  (typeof INVENTORY_TRANSACTION_SORT_FIELDS)[number];

export class InventoryTransactionPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: INVENTORY_TRANSACTION_ALL_FILTER_FIELDS,
    enumName: 'InventoryTransactionFilterField',
  })
  @IsOptional()
  @IsIn(INVENTORY_TRANSACTION_ALL_FILTER_FIELDS)
  filterField?: InventoryTransactionFilterField;

  @ApiPropertyOptional({
    enum: INVENTORY_TRANSACTION_SORT_FIELDS,
    enumName: 'InventoryTransactionSortField',
  })
  @IsOptional()
  @IsIn(INVENTORY_TRANSACTION_SORT_FIELDS)
  sortBy?: InventoryTransactionSortField;
}
