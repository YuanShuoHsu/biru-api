import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PrintJobDto } from '../../printers/dto/printer.dto.js';

export class OrderInvoicePrintDto {
  @ApiPropertyOptional({
    description:
      '未設定發票印表機時回傳列印頁內容，前端以 iframe srcdoc 呈現後列印，印完須回報 print-jobs/:jobId/confirmation',
    example: '<html>…</html>',
  })
  printHtml?: string;

  @ApiProperty({
    description: '這次列印的工作；瀏覽器列印在回報完成前都是結果不明',
    type: PrintJobDto,
  })
  printJob: PrintJobDto;
}
