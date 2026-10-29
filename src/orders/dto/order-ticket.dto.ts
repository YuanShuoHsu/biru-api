import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

import { ApiProperty, PickType } from '@nestjs/swagger';

import {
  orderTicketKindEnum,
  type OrderTicketKind,
} from '../../db/schema/printers.js';
import { PrintJobDto, PrinterDto } from '../../printers/dto/printer.dto.js';
import { trim } from '../../common/utils/trim.js';

export class OrderTicketJobDto extends PrintJobDto {
  @ApiProperty({
    description: 'order：訂單工作單；refund：退品單',
    enum: orderTicketKindEnum.enumValues,
    enumName: 'OrderTicketKind',
  })
  kind: OrderTicketKind;
  @ApiProperty({
    description: '印表機已移除時為 null',
    nullable: true,
    type: String,
  })
  printerName: string | null;
}

export class CreateOrderTicketPrinterDto {
  @ApiProperty({ description: '例如吧台、廚房' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(trim)
  name: string;
}

export class OrderTicketPrinterStatusDto extends PickType(PrinterDto, [
  'id',
  'lastSeenAt',
  'name',
  'online',
  'pollIntervalMs',
] as const) {}

export class OrderTicketPrinterOptionDto extends PickType(PrinterDto, [
  'id',
  'isDefault',
  'name',
] as const) {}

export class ReprintOrderTicketDto {
  @ApiProperty({ description: '要補印的工作單印表機', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  printerIds: string[];
}
