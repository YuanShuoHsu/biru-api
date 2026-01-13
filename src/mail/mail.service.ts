import { MailerService } from '@nestjs-modules/mailer';
import { BadRequestException, Injectable } from '@nestjs/common';

import { User } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { UAParser } from 'ua-parser-js';

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    private prisma: PrismaService,
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
    lang: string,
    userAgent: string,
  ): Promise<void> {
    const name = `${firstName} ${lastName}`;
    const support_url = `${process.env.NEXT_URL}/${lang}/company/contact`;
    const url = `${process.env.NEXT_URL}/${lang}/auth/verify-email?token=${token}`;

    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    const browser_name = result.browser?.name;
    const operating_system = result.os?.name;

    await this.mailerService
      .sendMail({
        to: email,
        subject: 'Welcome to Biru Coffee! Confirm your Email',
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

  async verifyEmail(token: string) {
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

  public async sendTestEmail(
    email: string,
  ): Promise<{ success: boolean; result: unknown }> {
    try {
      const result = (await this.mailerService.sendMail({
        to: email,
        subject: 'Biru Coffee SMTP Test',
        text: 'If you receive this email, your SMTP configuration is correct!',
        html: '<b>If you receive this email, your SMTP configuration is correct!</b>',
      })) as unknown;
      return { success: true, result };
    } catch (error) {
      console.error('SMTP Test Failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`SMTP Test Failed: ${message}`);
    }
  }
}
