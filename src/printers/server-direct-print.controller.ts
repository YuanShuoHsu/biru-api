import type { Request, Response } from 'express';

import { PrintersService } from './printers.service.js';
import { SERVER_DIRECT_PRINT_PATH } from './server-direct-print.js';
import {
  digestChallenge,
  parseDigestAuthorization,
  verifyDigest,
} from './utils/digest-auth.js';

import { Controller, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@AllowAnonymous()
@Controller()
export class ServerDirectPrintController {
  constructor(private readonly printersService: PrintersService) {}

  @Post(SERVER_DIRECT_PRINT_PATH)
  @SkipThrottle()
  @ApiExcludeEndpoint()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const params = parseDigestAuthorization(req.headers.authorization);
    const printer = params?.username
      ? await this.printersService.findByUsername(params.username)
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
          .send(await this.printersService.poll(printer));

        return;
      case 'SetResponse':
        await this.printersService.report(printer, body.ResponseFile ?? '');
        res.status(200).end();

        return;
      default:
        res.status(400).end();
    }
  }
}
