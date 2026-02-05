import { MailerService } from '@nestjs-modules/mailer';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { PRODUCT_NAME } from 'src/common/constants/product';
import * as schema from 'src/db/schema';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { I18nTranslations } from 'src/generated/i18n.generated';
import { UAParser } from 'ua-parser-js';

import { ResendEmailDto } from './dto/resend-email.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

type User = typeof schema.user.$inferSelect;

@Injectable()
export class MailsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly mailerService: MailerService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  public async sendEmail(
    {
      email,
      firstName,
      id,
      lastName,
    }: Pick<User, 'email' | 'firstName' | 'id' | 'lastName'>,
    token: string,
    userAgent: string,
    redirect?: string,
  ): Promise<void> {
    const lang = I18nContext.current()?.lang;
    const name = (lang === 'en' ? [firstName, lastName] : [lastName, firstName])
      .filter(Boolean)
      .join(' ');
    const productName = PRODUCT_NAME;
    const baseUrl = this.configService.get<string>('NEXT_URL');
    const support_url = `${baseUrl}/${lang}/company/contact`;
    const url = `${baseUrl}/${lang}/auth/verify-email?email=${encodeURIComponent(
      email || '',
    )}&identifier=${id}${
      redirect ? `&redirect=${encodeURIComponent(redirect)}` : ''
    }&token=${token}`;

    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    const browser_name = result.browser?.name || 'Unknown';
    const operating_system = result.os?.name || 'Unknown';

    await this.mailerService
      .sendMail({
        to: email || '',
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
          url,
        },
      })
      .then(() => {})
      .catch(() => {});
  }

  async verifyEmail({ identifier, token }: VerifyEmailDto) {
    const [userResult, verification] = await Promise.all([
      this.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, identifier))
        .limit(1),
      this.db.query.verification.findFirst({
        where: and(
          eq(schema.verification.identifier, identifier),
          eq(schema.verification.value, token),
        ),
      }),
    ]);

    const user = userResult[0];

    if (!verification) {
      throw new BadRequestException(
        this.i18n.t('users.invalidVerificationToken'),
      );
    }

    if (verification.expiresAt < new Date()) {
      await this.db
        .delete(schema.verification)
        .where(
          and(
            eq(schema.verification.identifier, identifier),
            eq(schema.verification.value, token),
          ),
        );

      throw new BadRequestException(
        this.i18n.t('users.invalidVerificationToken'),
      );
    }

    if (!user) throw new NotFoundException(this.i18n.t('users.userNotFound'));

    if (user.emailVerified) {
      await this.db
        .delete(schema.verification)
        .where(
          and(
            eq(schema.verification.identifier, identifier),
            eq(schema.verification.value, token),
          ),
        );

      throw new BadRequestException(this.i18n.t('users.emailAlreadyVerified'));
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.user)
        .set({ emailVerified: true })
        .where(eq(schema.user.id, user.id));

      await tx
        .delete(schema.verification)
        .where(
          and(
            eq(schema.verification.identifier, identifier),
            eq(schema.verification.value, token),
          ),
        );
    });
  }

  async resendEmail(
    { identifier, redirect }: ResendEmailDto,
    userAgent: string,
  ): Promise<void> {
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

    await this.sendEmail(user, token, userAgent, redirect);
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
