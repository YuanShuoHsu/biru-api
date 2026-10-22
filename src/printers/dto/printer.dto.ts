import { IsBoolean } from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  printCopyEnum,
  printJobStatusEnum,
  printerPurposeEnum,
  type PrintCopy,
  type PrintJobStatus,
  type PrinterPurpose,
} from '../../db/schema/printers.js';

export class PrinterDto {
  @ApiProperty() id: string;
  @ApiProperty({
    enum: printerPurposeEnum.enumValues,
    enumName: 'PrinterPurpose',
  })
  purpose: PrinterPurpose;
  @ApiProperty({
    description: '店家自訂的名稱（例如吧台、廚房）；發票印表機為 null',
    nullable: true,
    type: String,
  })
  name: string | null;
  @ApiProperty({ description: '填入印表機 Server Direct Print 的 ID' })
  username: string;
  @ApiProperty({ description: '填入印表機 Server Direct Print 的 URL' })
  url: string;
  @ApiPropertyOptional({ description: '印表機最後一次來拉列印工作的時間' })
  lastSeenAt?: Date | null;
  @ApiProperty({
    description:
      '從印表機實際來拉工作的節奏量出的輪詢間隔（毫秒），還沒量到時為 null',
    nullable: true,
    type: Number,
  })
  pollIntervalMs: number | null;
  @ApiProperty({ description: '印表機最近仍有來拉列印工作' })
  online: boolean;
  @ApiProperty() createdAt: Date;
}

export class PrinterCredentialsDto extends PrinterDto {
  @ApiProperty({ description: '只在建立或重設時回傳一次' })
  password: string;
  @ApiProperty({ description: '這次一併送印的張數' })
  queuedCount: number;
}

export class PrintJobDto {
  @ApiProperty() id: string;
  @ApiProperty({
    enum: printCopyEnum.enumValues,
    enumName: 'PrintCopy',
  })
  copy: PrintCopy;
  @ApiProperty({
    enum: printJobStatusEnum.enumValues,
    enumName: 'PrintJobStatus',
  })
  status: PrintJobStatus;
  @ApiPropertyOptional({ description: '印表機回報的錯誤碼' })
  errorCode?: string | null;
  @ApiPropertyOptional() sentAt?: Date | null;
  @ApiProperty() createdAt: Date;
}

export class ResolvePrintJobDto {
  @ApiProperty({ description: '店員確認紙本是否已印出' })
  @IsBoolean()
  printed: boolean;
}
