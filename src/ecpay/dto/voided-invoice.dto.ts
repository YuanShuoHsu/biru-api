import { ApiProperty } from '@nestjs/swagger';

export class VoidedInvoiceDto {
  @ApiProperty({ description: '發票 ID' })
  id: string;

  @ApiProperty({ description: '發票號碼', nullable: true })
  invoiceNumber: string | null;

  @ApiProperty({ description: '開立時間', nullable: true })
  invoiceDate: Date | null;

  @ApiProperty({
    description: '作廢時間；早期作廢的舊資料為 null',
    nullable: true,
  })
  voidedAt: Date | null;

  @ApiProperty({
    description: '送給綠界的作廢原因；未記錄時為 null',
    nullable: true,
  })
  reason: string | null;

  @ApiProperty({
    description:
      '作廢人員姓名；未記錄作廢人員（早期資料、或對帳時才發現綠界已作廢）或帳號已刪除時為 null',
    nullable: true,
  })
  operatorName: string | null;

  @ApiProperty({ description: '作廢人員帳號已刪除（姓名因此為 null）' })
  operatorDeleted: boolean;
}
