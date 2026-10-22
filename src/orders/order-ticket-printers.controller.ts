import {
  CreateOrderTicketPrinterDto,
  OrderTicketJobDto,
  OrderTicketPrinterStatusDto,
  ReprintOrderTicketDto,
} from './dto/order-ticket.dto.js';

import { OrderTicketService } from './order-ticket.service.js';

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';
import {
  PrinterCredentialsDto,
  PrinterDto,
  ResolvePrintJobDto,
} from '../printers/dto/printer.dto.js';
import { PRINTER_AUDIT } from '../printers/printer-audit.js';

@ApiTags('orders')
@Controller('organizations/:organizationSlug')
export class OrderTicketPrintersController {
  constructor(private readonly orderTicketService: OrderTicketService) {}

  @Get('order-ticket-printers')
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @ApiOkResponse({ isArray: true, type: PrinterDto })
  @ApiOperation({ summary: '查看工作單印表機設定' })
  findAll(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<PrinterDto[]> {
    return this.orderTicketService.listPrinters(organizationSlug);
  }

  @Get('order-ticket-printers/status')
  @Roles({ order: ['read'] }, 'organizationSlug')
  @ApiOkResponse({ isArray: true, type: OrderTicketPrinterStatusDto })
  @ApiOperation({ summary: '工作單印表機是否在線（訂單頁顯示離線提示用）' })
  status(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<OrderTicketPrinterStatusDto[]> {
    return this.orderTicketService.listPrinterStatuses(organizationSlug);
  }

  @Post('order-ticket-printers')
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit(PRINTER_AUDIT)
  @ApiCreatedResponse({ type: PrinterCredentialsDto })
  @ApiOperation({
    summary: '新增工作單印表機，並把目前製作中的訂單排進它的佇列',
  })
  create(
    @Param('organizationSlug') organizationSlug: string,
    @Body() { name }: CreateOrderTicketPrinterDto,
  ): Promise<PrinterCredentialsDto> {
    return this.orderTicketService.createPrinter(organizationSlug, name);
  }

  @Put('order-ticket-printers/:printerId/credentials')
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit(PRINTER_AUDIT)
  @ApiOkResponse({ type: PrinterCredentialsDto })
  @ApiOperation({ summary: '重設工作單印表機帳密（舊帳密立即失效）' })
  reset(
    @Param('organizationSlug') organizationSlug: string,
    @Param('printerId') printerId: string,
  ): Promise<PrinterCredentialsDto> {
    return this.orderTicketService.resetPrinter(organizationSlug, printerId);
  }

  @Delete('order-ticket-printers/:printerId')
  @HttpCode(204)
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit(PRINTER_AUDIT)
  @ApiNoContentResponse()
  @ApiOperation({ summary: '移除工作單印表機，尚未印出的工作單一併取消' })
  remove(
    @Param('organizationSlug') organizationSlug: string,
    @Param('printerId') printerId: string,
  ): Promise<void> {
    return this.orderTicketService.deletePrinter(organizationSlug, printerId);
  }

  @Post('orders/:orderId/order-tickets/reprint')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @ApiCreatedResponse({ isArray: true, type: OrderTicketJobDto })
  @ApiOperation({ summary: '重印工作單：在指定的工作單印表機各補印一張' })
  reprint(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
    @Body() { printerIds }: ReprintOrderTicketDto,
  ): Promise<OrderTicketJobDto[]> {
    return this.orderTicketService.reprint(
      organizationSlug,
      orderId,
      printerIds,
    );
  }

  @Post('orders/:orderId/order-tickets/:jobId/resolution')
  @Roles({ order: ['update'] }, 'organizationSlug')
  @ApiCreatedResponse({ type: OrderTicketJobDto })
  @ApiOperation({
    summary: '確認列印結果不明的工作單：有印出就結案，沒印出就重新排入佇列',
  })
  resolve(
    @Param('organizationSlug') organizationSlug: string,
    @Param('orderId') orderId: string,
    @Param('jobId') jobId: string,
    @Body() { printed }: ResolvePrintJobDto,
  ): Promise<OrderTicketJobDto> {
    return this.orderTicketService.resolveUnknown(
      organizationSlug,
      orderId,
      jobId,
      printed,
    );
  }
}
