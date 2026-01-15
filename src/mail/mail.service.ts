import { MailerService } from '@nestjs-modules/mailer';
import { BadRequestException, Injectable } from '@nestjs/common';

import { I18nContext, I18nService } from 'nestjs-i18n';
import { User } from 'prisma/generated/client';
import { I18nTranslations } from 'src/generated/i18n.generated';
import { PrismaService } from 'src/prisma/prisma.service';
import { UAParser } from 'ua-parser-js';

import { SendTestEmailDto } from './dto/send-test-email.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    private prisma: PrismaService,
    private readonly i18n: I18nService<I18nTranslations>,
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

  public async sendVerificationEmail(
    { email, firstName, lastName }: User,
    token: string,
    userAgent: string,
  ): Promise<void> {
    const name = `${firstName} ${lastName}`;
    const lang = I18nContext.current()?.lang;
    const support_url = `${process.env.NEXT_URL}/${lang}/company/contact`;
    const url = `${process.env.NEXT_URL}/${lang}/auth/verify-email?token=${token}`;

    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    const browser_name = result.browser?.name;
    const operating_system = result.os?.name;

    await this.mailerService
      .sendMail({
        to: email,
        subject: this.i18n.t('mail.welcome.subject'),
        template: 'welcome',
        context: {
          browser_name,
          name,
          operating_system,
          support_url,
          url,
        },
      })
      .then(() => {})
      .catch(() => {});
  }

  async verifyEmail({ token }: VerifyEmailDto) {
    const user = await this.prisma.user.findUnique({
      where: { emailVerificationToken: token },
    });

    if (!user) throw new BadRequestException('Invalid verification token');

    return await this.prisma.user.update({
      where: { emailVerificationToken: token },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
      },
    });
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
