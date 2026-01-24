import { Controller, Get } from '@nestjs/common';

import { I18n, I18nContext } from 'nestjs-i18n';

import { AppService } from './app.service';

@Controller('hello')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('translated')
  getTranslatedHello(@I18n() i18n: I18nContext) {
    return i18n.t('test.hello');
  }
}
