import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { I18n, I18nContext } from 'nestjs-i18n';

import { AppService } from './app.service';

@Controller('hello')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @AllowAnonymous()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @AllowAnonymous()
  @Get('translated')
  getTranslatedHello(@I18n() i18n: I18nContext) {
    return this.appService.getTranslatedHello(i18n);
  }
}
