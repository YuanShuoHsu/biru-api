import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

import { Public } from 'src/auth/decorators/public.decorator';

import { SendTestEmailDto } from './dto/send-test-email.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { MailService } from './mail.service';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

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

  @Public()
  @Post('verify-email')
  @ApiOperation({ summary: '驗證使用者 Email' })
  async verify(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.mailService.verifyEmail(verifyEmailDto);
  }

  @Public()
  @Post('test')
  @ApiOperation({ summary: '測試 SMTP 設定' })
  async test(@Body() sendTestEmailDto: SendTestEmailDto) {
    return this.mailService.sendTestEmail(sendTestEmailDto);
  }
}
