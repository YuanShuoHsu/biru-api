import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

import { ResendEmailDto } from './dto/resend-email.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { MailsService } from './mails.service';

@Controller('mails')
export class MailsController {
  constructor(private readonly mailsService: MailsService) {}

  // @Post()
  // create(@Body() createMailDto: CreateMailDto) {
  //   return this.mailService.create(createMailDto);
  // }

  // @Get()
  // findAll() {
  //   return this.mailService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.mailService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateMailDto: UpdateMailDto) {
  //   return this.mailService.update(+id, updateMailDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.mailService.remove(+id);
  // }

  @Post('verify')
  @ApiOperation({ summary: '驗證使用者 Email' })
  async verify(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.mailsService.verifyEmail(verifyEmailDto);
  }

  @Post('resend')
  @ApiOperation({ summary: '重新寄送驗證信' })
  async resend(
    @Body() resendEmailDto: ResendEmailDto,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.mailsService.resendEmail(resendEmailDto, userAgent);
  }

  @Post('test')
  @ApiOperation({ summary: '測試 SMTP 設定' })
  async test(@Body() sendTestEmailDto: SendTestEmailDto) {
    return this.mailsService.sendTestEmail(sendTestEmailDto);
  }
}
