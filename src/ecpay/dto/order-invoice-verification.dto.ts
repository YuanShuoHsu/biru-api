import { IsBoolean, IsDefined, IsString } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class OrderInvoiceVerificationDto {
  @ApiProperty({ description: '綠界端的發票號碼' })
  @IsDefined()
  @IsString()
  invoiceNumber: string;

  @ApiProperty({ description: '綠界端的開立時間' })
  @IsDefined()
  @IsString()
  invoiceDate: string;

  @ApiProperty({ description: '綠界端的發票金額' })
  @IsDefined()
  @IsString()
  salesAmount: string;

  @ApiProperty({ description: '綠界端是否已作廢' })
  @IsDefined()
  @IsBoolean()
  invalidated: boolean;

  @ApiProperty({ description: '是否已上傳財政部' })
  @IsDefined()
  @IsBoolean()
  uploaded: boolean;

  @ApiProperty({
    description: '綠界端狀態是否與本機一致；false 代表兩邊對不起來，需人工處理',
  })
  @IsDefined()
  @IsBoolean()
  matchesLocal: boolean;
}
