import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

import { IsBusinessNumber } from '../../common/decorators/is-business-number.decorator.js';
import { trim } from '../../common/utils/trim.js';

export class VoidInvoiceDto {
  @ApiProperty({ description: '作廢原因', maxLength: 20 })
  @IsString()
  @Length(1, 20)
  reason: string;

  @ApiPropertyOptional({
    description:
      '重新開立時要更正的統一編號（須通過檢查碼）；省略則沿用作廢那張的買受人資訊',
  })
  @IsOptional()
  @Transform(trim)
  @IsBusinessNumber()
  customerIdentifier?: string;

  @ApiPropertyOptional({ description: '重新開立時要更正的買受人抬頭' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  customerName?: string;
}
