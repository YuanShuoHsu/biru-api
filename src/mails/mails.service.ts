import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { I18nService } from 'nestjs-i18n';
import { PRODUCT_NAME } from 'src/common/constants/product';
import { DEFAULT_LANG, type User } from 'src/db/schema/users';
import { I18nTranslations } from 'src/generated/i18n.generated';
import { UAParser } from 'ua-parser-js';

import { SendTestEmailDto } from './dto/send-test-email.dto';

@Injectable()
export class MailsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly mailerService: MailerService,
  ) {}

  public async sendEmail(
    {
      user: { email, name },
      url,
      token,
    }: {
      user: Pick<User, 'email' | 'name'>;
      url: string;
      token: string;
    },
    request?: Request,
  ): Promise<void> {
    const productName = PRODUCT_NAME;

    const baseUrl = this.configService.get<string>('NEXT_URL');
    const lang = request?.headers.get('accept-language') || DEFAULT_LANG;
    const support_url = `${baseUrl}/${lang}/company/contact`;

    const parsedUrl = new URL(url);
    const callbackURL = parsedUrl.searchParams.get('callbackURL');
    const verifyParams = new URLSearchParams({
      email,
      token,
      ...(callbackURL && { redirectTo: callbackURL }),
    });
    const verifyEmailUrl = `${baseUrl}/${lang}/auth/verify-email?${verifyParams.toString()}`;

    const userAgent = request?.headers.get('user-agent') || undefined;
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    const browser_name = result.browser?.name || 'Unknown';
    const operating_system = result.os?.name || 'Unknown';

    await this.mailerService
      .sendMail({
        to: email,
        subject: this.i18n.t('mail.welcome.subject', {
          args: { productName },
        }),
        template: 'welcome',
        context: {
          browser_name,
          i18nLang: lang,
          name,
          operating_system,
          productName,
          support_url,
          url: verifyEmailUrl,
        },
      })
      .then(() => {})
      .catch(() => {});
  }

  public async sendTestEmail({ email }: SendTestEmailDto): Promise<void> {
    await this.mailerService
      .sendMail({
        to: email,
        subject: 'Biru Coffee SMTP Test',
        text: 'If you receive this email, your SMTP configuration is correct!',
        html: '<b>If you receive this email, your SMTP configuration is correct!</b>',
      })
      .then(() => {})
      .catch(() => {});
  }
}
