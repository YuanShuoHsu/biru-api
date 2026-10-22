import { ApiPropertyOptional } from '@nestjs/swagger';

import { InvoicePrintJobDto } from './invoice-printer.dto.js';

export class OrderInvoicePrintDto {
  @ApiPropertyOptional({
    description:
      '未設定發票印表機時回傳列印頁內容，前端以 iframe srcdoc 呈現後列印，印完須回報 print/confirmation',
    example: '<html>…</html>',
  })
  printHtml?: string;

  @ApiPropertyOptional({
    description: '已設定發票印表機時回傳排入佇列的列印工作',
    type: InvoicePrintJobDto,
  })
  printJob?: InvoicePrintJobDto;
}
