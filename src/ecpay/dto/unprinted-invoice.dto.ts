import { IsString } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class UnprintedInvoiceDto {
  @ApiProperty({ description: '訂單 ID' })
  @IsString()
  orderId: string;
}
