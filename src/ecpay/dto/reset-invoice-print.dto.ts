import { IsString, Length } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class ResetInvoicePrintDto {
  @ApiProperty({ description: '重設列印的理由', maxLength: 100 })
  @IsString()
  @Length(1, 100)
  reason: string;
}
