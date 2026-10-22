import { IsBoolean } from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  invoicePrintCopyEnum,
  invoicePrintJobStatusEnum,
  type InvoicePrintCopy,
  type InvoicePrintJobStatus,
} from '../../db/schema/invoices.js';

export class InvoicePrinterDto {
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
  @ApiProperty() createdAt: Date;
}

export class InvoicePrinterCredentialsDto extends InvoicePrinterDto {
  @ApiProperty({ description: '只在建立或重設時回傳一次' })
  password: string;
  @ApiProperty({ description: '這次一併送印的未印正本張數' })
  queuedCount: number;
}

export class InvoicePrintJobDto {
  @ApiProperty() id: string;
  @ApiProperty({
    enum: invoicePrintCopyEnum.enumValues,
    enumName: 'InvoicePrintCopy',
  })
  copy: InvoicePrintCopy;
  @ApiProperty({
    enum: invoicePrintJobStatusEnum.enumValues,
    enumName: 'InvoicePrintJobStatus',
  })
  status: InvoicePrintJobStatus;
  @ApiPropertyOptional({ description: '印表機回報的錯誤碼' })
  errorCode?: string | null;
  @ApiPropertyOptional() sentAt?: Date | null;
  @ApiProperty() createdAt: Date;
}

export class ResolveInvoicePrintJobDto {
  @ApiProperty({ description: '店員確認紙本是否已印出' })
  @IsBoolean()
  printed: boolean;
}

export class InvoicePrinterSettingDto {
  @ApiPropertyOptional({ type: InvoicePrinterDto, nullable: true })
  printer: InvoicePrinterDto | null;
}

export class InvoicePrinterStatusDto {
  @ApiProperty({ description: '是否設定了發票印表機' })
  configured: boolean;
  @ApiProperty({
    description: '印表機最近仍有來拉列印工作；離線時列印發票改用瀏覽器',
  })
  online: boolean;
  @ApiPropertyOptional({ description: '印表機最後一次連線的時間' })
  lastSeenAt?: Date | null;
  @ApiProperty({
    description:
      '從印表機實際來拉工作的節奏量出的輪詢間隔（毫秒），還沒量到時為 null',
    nullable: true,
    type: Number,
  })
  pollIntervalMs: number | null;
}
