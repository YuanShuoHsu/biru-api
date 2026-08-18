import { IsDefined, IsString } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class OrderInvoicePrintDto {
  @ApiProperty({
    description: '發票列印網址（熱感應紙格式），自取得起 1 小時內有效',
    example: 'https://vendor.ecpay.com.tw/Einvoice/...',
  })
  @IsDefined()
  @IsString()
  printUrl: string;

  @ApiProperty({
    description: '列印頁內容，前端以 iframe srcdoc 呈現後列印',
    example: '<html>…</html>',
  })
  @IsDefined()
  @IsString()
  printHtml: string;
}
