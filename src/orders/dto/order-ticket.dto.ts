import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { ApiProperty, PickType } from '@nestjs/swagger';

import {
  orderTicketKindEnum,
  type OrderTicketKind,
} from '../../db/schema/printers.js';
import { PrintJobDto, PrinterDto } from '../../printers/dto/printer.dto.js';

export class OrderTicketJobDto extends PrintJobDto {
  @ApiProperty({
    description: 'order：訂單工作單；refund：退品單',
    enum: orderTicketKindEnum.enumValues,
    enumName: 'OrderTicketKind',
  })
  kind: OrderTicketKind;
  @ApiProperty() printerName: string;
}

export class CreateOrderTicketPrinterDto {
  @ApiProperty({ description: '例如吧台、廚房' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;
}

export class OrderTicketPrinterStatusDto extends PickType(PrinterDto, [
  'id',
  'lastSeenAt',
  'name',
  'online',
  'pollIntervalMs',
] as const) {}
