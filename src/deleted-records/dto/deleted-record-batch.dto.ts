import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
} from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import type { LocalizedText } from '../../db/schema/enums.js';

import {
  RESTORABLE_TABLES,
  type RestorableTable,
} from '../deleted-record-tables.js';

export const DELETED_RECORD_STRING_FILTER_FIELDS = [
  'organizationName',
] as const;
export const DELETED_RECORD_ENUM_FILTER_FIELDS = ['tableName'] as const;
export const DELETED_RECORD_DATE_FILTER_FIELDS = ['deletedAt'] as const;
export const DELETED_RECORD_FILTER_FIELDS = [
  ...DELETED_RECORD_STRING_FILTER_FIELDS,
  ...DELETED_RECORD_ENUM_FILTER_FIELDS,
  ...DELETED_RECORD_DATE_FILTER_FIELDS,
] as const;

export type DeletedRecordFilterField =
  (typeof DELETED_RECORD_FILTER_FIELDS)[number];

export const DELETED_RECORD_SORT_FIELDS = DELETED_RECORD_FILTER_FIELDS;

export type DeletedRecordSortField =
  (typeof DELETED_RECORD_SORT_FIELDS)[number];

export class DeletedRecordPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: DELETED_RECORD_FILTER_FIELDS,
    enumName: 'DeletedRecordFilterField',
  })
  @IsOptional()
  @IsIn(DELETED_RECORD_FILTER_FIELDS)
  filterField?: DeletedRecordFilterField;

  @ApiPropertyOptional({
    enum: DELETED_RECORD_SORT_FIELDS,
    enumName: 'DeletedRecordSortField',
  })
  @IsOptional()
  @IsIn(DELETED_RECORD_SORT_FIELDS)
  sortBy?: DeletedRecordSortField;
}

export class RestoreDeletedRecordsDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  ids: number[];
}

export class DeletedRecordBatchResponseDto {
  @ApiProperty({ description: '同一次刪除（同一個交易）的編號' })
  batchId: number;

  @ApiProperty() deletedAt: Date;

  @ApiProperty({ enum: RESTORABLE_TABLES, enumName: 'DeletedRecordTable' })
  tableName: RestorableTable;

  @ApiPropertyOptional({ nullable: true }) recordId?: string | null;

  @ApiPropertyOptional({
    description: '名稱、代碼或電子郵件；多語欄位為各語系物件',
    nullable: true,
    oneOf: [
      { type: 'string' },
      { type: 'object', additionalProperties: { type: 'string' } },
    ],
  })
  label?: string | LocalizedText | null;

  @ApiPropertyOptional({ nullable: true }) organizationName?: string | null;

  @ApiProperty({ description: '連帶刪除的相關資料筆數（不含本身）' })
  relatedCount: number;

  @ApiPropertyOptional({
    description: '由稽核紀錄比對出的刪除者；查不到時為 null',
    nullable: true,
  })
  deletedBy?: string | null;

  @ApiProperty({
    description: '目前操作者可否還原（店內須具備各資料的建立權限）',
  })
  canRestore: boolean;
}

export class DeletedRecordPermissionDto {
  @ApiProperty({ description: '目前成員是否能還原本店任何一種資料' })
  canRestore: boolean;
}
