import type { Request, Response } from 'express';

import {
  InvoicePrinterCredentialsDto,
  InvoicePrinterSettingDto,
} from './dto/invoice-printer.dto.js';

import {
  InvoicePrinterService,
  SERVER_DIRECT_PRINT_PATH,
} from './services/invoice-printer.service.js';

import {
  digestChallenge,
  parseDigestAuthorization,
  verifyDigest,
} from './utils/digest-auth.js';

import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { Roles } from '../menus/decorators/roles.decorator.js';

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

  @Put()
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @ApiOkResponse({ type: InvoicePrinterCredentialsDto })
  @ApiOperation({
    summary: '設定發票印表機，或重設帳密（舊帳密立即失效）',
  })
  register(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<InvoicePrinterCredentialsDto> {
    return this.invoicePrinterService.registerPrinter(organizationSlug);
  }

  @Delete()
  @HttpCode(204)
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @ApiNoContentResponse()
  @ApiOperation({ summary: '移除發票印表機，之後改回瀏覽器列印' })
  remove(@Param('organizationSlug') organizationSlug: string): Promise<void> {
    return this.invoicePrinterService.deletePrinter(organizationSlug);
  }
}

@AllowAnonymous()
@Controller()
export class ServerDirectPrintController {
  constructor(private readonly invoicePrinterService: InvoicePrinterService) {}

  @Post(SERVER_DIRECT_PRINT_PATH)
  @SkipThrottle()
  @ApiExcludeEndpoint()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const params = parseDigestAuthorization(req.headers.authorization);
    const printer = params?.username
      ? await this.invoicePrinterService.findPrinterByUsername(params.username)
      : undefined;
    const verification =
      params && printer && params.uri === req.originalUrl
        ? verifyDigest(params, req.method, printer.digestHa1)
        : 'invalid';

    if (!printer || verification !== 'valid') {
      res
        .status(401)
        .set('WWW-Authenticate', digestChallenge(verification === 'stale'))
        .end();

      return;
    }

    const body = req.body as Record<string, string | undefined>;

    switch (body.ConnectionType) {
      case 'GetRequest':
        res
          .status(200)
          .type('text/xml; charset=utf-8')
          .send(await this.invoicePrinterService.poll(printer));

        return;
      case 'SetResponse':
        await this.invoicePrinterService.report(
          printer,
          body.ResponseFile ?? '',
        );
        res.status(200).end();

        return;
      default:
        res.status(400).end();
    }
  }
}
