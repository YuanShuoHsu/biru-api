import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

import { AdminGuard } from 'src/common/guards/admin.guard';

import { SendTestEmailDto } from './dto/send-test-email.dto';
import { MailsService } from './mails.service';

@UseGuards(AdminGuard)
@Controller('mails')
export class MailsController {
  constructor(private readonly mailsService: MailsService) {}

  @Post('test')
  @ApiOperation({ summary: '測試 SMTP 設定' })
  async test(@Body() sendTestEmailDto: SendTestEmailDto) {
    return this.mailsService.sendTestEmail(sendTestEmailDto);
  }
}
