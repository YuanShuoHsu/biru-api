import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import type { LocalizedText } from 'src/db/schema/enums';

import {
  RESTORABLE_TABLES,
  type RestorableTable,
} from '../deleted-record-tables';

export class DeletedRecordPaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class DeletedRecordBatchResponseDto {
  @ApiProperty({ description: '同一次刪除（同一個交易）的編號' })
  batchId: string;

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
}
