import { Injectable } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getTranslatedHello(i18n: I18nContext): string {
    return i18n.t('test.hello');
  }
}
