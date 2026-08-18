import { IsDefined, IsString } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class OrderInvoicePrintDto {
  @ApiProperty({
    description: '列印頁內容，前端以 iframe srcdoc 呈現後列印',
    example: '<html>…</html>',
  })
  @IsDefined()
  @IsString()
  printHtml: string;
}
