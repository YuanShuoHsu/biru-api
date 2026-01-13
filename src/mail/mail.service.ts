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
    const {
      browser: { name: browser_name },
      os: { name: operating_system },
    } = parser.getResult();

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
}
