import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PrinterDto } from '../../printers/dto/printer.dto.js';

export class InvoicePrinterSettingDto {
  @ApiPropertyOptional({ type: PrinterDto, nullable: true })
  printer: PrinterDto | null;
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
