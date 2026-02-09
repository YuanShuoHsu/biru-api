import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { ResendEmailDto } from './dto/resend-email.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { MailsService } from './mails.service';

@Controller('mails')
export class MailsController {
  constructor(private readonly mailsService: MailsService) {}

  @AllowAnonymous()
  @Post('verify')
  @ApiOperation({ summary: '驗證使用者 Email' })
  async verify(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.mailsService.verifyEmail(verifyEmailDto);
  }

  @Post('resend')
  @ApiOperation({ summary: '重新寄送驗證信' })
  async resend(@Body() resendEmailDto: ResendEmailDto) {
    return this.mailsService.resendEmail(resendEmailDto);
  }

  @Post('test')
  @ApiOperation({ summary: '測試 SMTP 設定' })
  async test(@Body() sendTestEmailDto: SendTestEmailDto) {
    return this.mailsService.sendTestEmail(sendTestEmailDto);
  }
}
