import { MailerService } from '@nestjs-modules/mailer';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomUUID } from 'crypto';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { User } from 'prisma/generated/client';
import { PRODUCT_NAME } from 'src/common/constants';
import { I18nTranslations } from 'src/generated/i18n.generated';
import { PrismaService } from 'src/prisma/prisma.service';
import { VerificationsService } from 'src/verifications/verifications.service';
import { UAParser } from 'ua-parser-js';

import { ResendEmailDto } from './dto/resend-email.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@Injectable()
export class MailsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly mailerService: MailerService,
    private prisma: PrismaService,
    private readonly verificationsService: VerificationsService,
  ) {}

  // create(createMailDto: CreateMailDto) {
  //   return 'This action adds a new mail';
  // }

  // findAll() {
  //   return `This action returns all mail`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} mail`;
  // }

  // update(id: number, updateMailDto: UpdateMailDto) {
  //   return `This action updates a #${id} mail`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} mail`;
  // }

  public async sendEmail(
    { email, firstName, id, lastName }: User,
    token: string,
    userAgent: string,
    redirect?: string,
  ): Promise<void> {
    const lang = I18nContext.current()?.lang;
    const name =
      lang === 'en' ? `${firstName} ${lastName}` : `${lastName} ${firstName}`;
    const productName = PRODUCT_NAME;
    const baseUrl = this.configService.get<string>('NEXT_URL');
    const support_url = `${baseUrl}/${lang}/company/contact`;
    const url = `${baseUrl}/${lang}/auth/verify-email?email=${encodeURIComponent(
      email,
    )}&identifier=${id}${
      redirect ? `&redirect=${encodeURIComponent(redirect)}` : ''
    }&token=${token}`;

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
          url,
        },
      })
      .then(() => {})
      .catch(() => {});
  }

  async verifyEmail({ identifier, token }: VerifyEmailDto) {
    const [user, verification] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: identifier },
      }),
      this.verificationsService.verification({
        identifier_token: {
          identifier,
          token,
        },
      }),
    ]);

    if (!verification)
      throw new BadRequestException(
        this.i18n.t('users.invalidVerificationToken'),
      );
    if (verification.expiresAt < new Date()) {
      await this.verificationsService.deleteVerification({
        identifier_token: { identifier, token },
      });

      throw new BadRequestException(
        this.i18n.t('users.invalidVerificationToken'),
      );
    }

    if (!user) throw new NotFoundException(this.i18n.t('users.userNotFound'));
    if (user.emailVerified) {
      await this.verificationsService.deleteVerification({
        identifier_token: { identifier, token },
      });

      throw new BadRequestException(this.i18n.t('users.emailAlreadyVerified'));
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
      },
    });
    await this.verificationsService.deleteVerification({
      identifier_token: { identifier, token },
    });
  }

  async resendEmail(
    { identifier, redirect }: ResendEmailDto,
    userAgent: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: identifier },
    });
    if (!user) throw new NotFoundException(this.i18n.t('users.userNotFound'));
    if (user.emailVerified)
      throw new BadRequestException(this.i18n.t('users.emailAlreadyVerified'));

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.verificationsService.deleteVerifications({
      identifier: user.id,
    });

    await this.verificationsService.createVerification({
      expiresAt,
      identifier: user.id,
      token,
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
