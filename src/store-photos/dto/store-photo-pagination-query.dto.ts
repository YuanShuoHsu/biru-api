import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const STORE_PHOTO_STRING_FILTER_FIELDS = ['alt'] as const;
export const STORE_PHOTO_ENUM_FILTER_FIELDS = ['isActive'] as const;
export const STORE_PHOTO_DATE_FILTER_FIELDS = [
  'createdAt',
  'updatedAt',
] as const;
const STORE_PHOTO_ALL_FILTER_FIELDS = [
  ...STORE_PHOTO_STRING_FILTER_FIELDS,
  ...STORE_PHOTO_ENUM_FILTER_FIELDS,
  ...STORE_PHOTO_DATE_FILTER_FIELDS,
] as const;

type StorePhotoFilterField = (typeof STORE_PHOTO_ALL_FILTER_FIELDS)[number];

const STORE_PHOTO_SORT_FIELDS = [
  'alt',
  'isActive',
  'createdAt',
  'updatedAt',
] as const;

type StorePhotoSortField = (typeof STORE_PHOTO_SORT_FIELDS)[number];

export class StorePhotoPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: STORE_PHOTO_ALL_FILTER_FIELDS,
    enumName: 'StorePhotoFilterField',
  })
  @IsOptional()
  @IsIn(STORE_PHOTO_ALL_FILTER_FIELDS)
  filterField?: StorePhotoFilterField;

  @ApiPropertyOptional({
    enum: STORE_PHOTO_SORT_FIELDS,
    enumName: 'StorePhotoSortField',
  })
  @IsOptional()
  @IsIn(STORE_PHOTO_SORT_FIELDS)
  sortBy?: StorePhotoSortField;
}
