import { MailerService } from '@nestjs-modules/mailer';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService as BetterAuthService } from '@thallesp/nestjs-better-auth';

import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { I18nContext, I18nService } from 'nestjs-i18n';
import type { Auth } from 'src/auth';
import { PRODUCT_NAME } from 'src/common/constants/product';
import * as schema from 'src/db/schema';
import type { User } from 'src/db/schema/users';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { I18nTranslations } from 'src/generated/i18n.generated';
import { UAParser } from 'ua-parser-js';

import { ResendEmailDto } from './dto/resend-email.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@Injectable()
export class MailsService {
  constructor(
    @Inject(forwardRef(() => BetterAuthService))
    private readonly betterAuthService: BetterAuthService<Auth>,
    private readonly cls: ClsService,
    private readonly configService: ConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly mailerService: MailerService,
  ) {}

  async verifyEmail({ token }: VerifyEmailDto) {
    return await this.betterAuthService.api.verifyEmail({
      query: { token },
    });
  }

  public async sendEmail(
    { email, name }: Pick<User, 'email' | 'name'>,
    url: string,
    token: string,
  ): Promise<void> {
    const lang = I18nContext.current()?.lang;
    const productName = PRODUCT_NAME;

    const baseUrl = this.configService.get<string>('NEXT_URL');
    const support_url = `${baseUrl}/${lang}/company/contact`;

    const parsedUrl = new URL(url);
    const callbackURL = parsedUrl.searchParams.get('callbackURL');
    const verifyParams = new URLSearchParams({
      email,
      token,
      ...(callbackURL && { redirectTo: callbackURL }),
    });
    const verifyEmailUrl = `${baseUrl}/${lang}/auth/verify-email?${verifyParams.toString()}`;

    const userAgent = this.cls.get<string>('userAgent');
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

  async resendEmail({ identifier }: ResendEmailDto): Promise<void> {
    const userResult = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, identifier))
      .limit(1);
    const user = userResult[0];

    if (!user) throw new NotFoundException(this.i18n.t('users.userNotFound'));
    if (user.emailVerified)
      throw new BadRequestException(this.i18n.t('users.emailAlreadyVerified'));

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.verification)
        .where(eq(schema.verification.identifier, user.id));

      await tx.insert(schema.verification).values({
        expiresAt,
        identifier: user.id,
        value: token,
      });
    });

    // await this.sendEmail(user, dummyUrl);
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
