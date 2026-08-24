import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VoidInvoiceDto {
  @ApiProperty({ description: '作廢原因', maxLength: 20 })
  @IsString()
  @Length(1, 20)
  reason: string;

  @ApiPropertyOptional({
    description: '重新開立時要更正的統一編號；省略則沿用作廢那張的買受人資訊',
  })
  @IsOptional()
  @Matches(/^\d{8}$/, { message: 'customerIdentifier must be 8 digits' })
  customerIdentifier?: string;

  @ApiPropertyOptional({ description: '重新開立時要更正的買受人抬頭' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  customerName?: string;
}
