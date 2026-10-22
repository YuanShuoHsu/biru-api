import {
  InvoicePrinterSettingDto,
  InvoicePrinterStatusDto,
} from './dto/invoice-printer.dto.js';

import { InvoicePrinterService } from './services/invoice-printer.service.js';

import { Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';
import { PrinterCredentialsDto } from '../printers/dto/printer.dto.js';
import { PRINTER_AUDIT } from '../printers/printer-audit.js';

@ApiTags('organizations')
@Controller('organizations/:organizationSlug/invoice-printer')
export class InvoicePrinterController {
  constructor(private readonly invoicePrinterService: InvoicePrinterService) {}

  @Get()
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @ApiOkResponse({ type: InvoicePrinterSettingDto })
  @ApiOperation({ summary: '查看發票印表機設定' })
  async find(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<InvoicePrinterSettingDto> {
    return {
      printer: await this.invoicePrinterService.getPrinter(organizationSlug),
    };
  }

  @Get('status')
  @Roles({ order: ['read'] }, 'organizationSlug')
  @ApiOkResponse({ type: InvoicePrinterStatusDto })
  @ApiOperation({ summary: '發票印表機是否在線（訂單頁顯示離線提示用）' })
  status(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<InvoicePrinterStatusDto> {
    return this.invoicePrinterService.getStatus(organizationSlug);
  }

  @Put()
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit(PRINTER_AUDIT)
  @ApiOkResponse({ type: PrinterCredentialsDto })
  @ApiOperation({
    summary: '設定發票印表機，或重設帳密（舊帳密立即失效）',
  })
  register(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<PrinterCredentialsDto> {
    return this.invoicePrinterService.registerPrinter(organizationSlug);
  }

  @Delete()
  @HttpCode(204)
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit(PRINTER_AUDIT)
  @ApiNoContentResponse()
  @ApiOperation({ summary: '移除發票印表機，之後改回瀏覽器列印' })
  remove(@Param('organizationSlug') organizationSlug: string): Promise<void> {
    return this.invoicePrinterService.deletePrinter(organizationSlug);
  }
}
