import { Body, Controller, Post, Request } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

import { fromNodeHeaders } from 'better-auth/node';
import type { Request as ExpressRequest } from 'express';

import { AuthService } from './auth.service';
import { ResendEmailDto } from './dto/resend-email.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('resend-email')
  @ApiOperation({ summary: '重發驗證信' })
  async resend(
    @Body() resendEmailDto: ResendEmailDto,
    @Request() req: ExpressRequest,
  ): Promise<void> {
    return this.authService.resendEmail(
      resendEmailDto,
      fromNodeHeaders(req.headers),
    );
  }
}
