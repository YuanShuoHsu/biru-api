// https://docs.nestjs.com/recipes/prisma

import { MailerService } from '@nestjs-modules/mailer';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { randomUUID } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { Prisma, Provider, User } from 'prisma/generated/client';
import { normalizeEmail } from 'src/common/utils/email';
import { hash } from 'src/common/utils/hashing';
import { I18nTranslations } from 'src/generated/i18n.generated';
import { MailService } from 'src/mail/mail.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly mailerService: MailerService,
    private mailService: MailService,
    private prisma: PrismaService,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  async user(
    userWhereUniqueInput: Prisma.UserWhereUniqueInput,
  ): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: userWhereUniqueInput,
    });
  }

  async users(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.UserWhereUniqueInput;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    const { skip, take, cursor, where, orderBy } = params;

    return await this.prisma.user.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
  }

  async createUser(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  async createUserWithPassword(
    {
      email,
      password,
      ...rest
    }: Omit<Prisma.UserCreateInput, 'accounts' | 'email'> & {
      email: string;
      password: string;
    },
    userAgent: string,
  ): Promise<User> {
    const normalizedEmail = normalizeEmail(email);
    const hashedPassword = await hash(password);
    const emailVerificationToken = randomUUID();

    const user = await this.createUser({
      ...rest,
      email: normalizedEmail,
      emailVerificationToken,
      accounts: {
        create: {
          accountId: normalizedEmail,
          password: hashedPassword,
          providerId: Provider.LOCAL,
        },
      },
    });

    await this.mailService.sendVerificationEmail(
      user,
      emailVerificationToken,
      userAgent,
    );

    return user;
  }

  async resendVerificationEmail(
    email: string,
    userAgent: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) throw new NotFoundException(this.i18n.t('users.userNotFound'));

    if (user.emailVerified)
      throw new BadRequestException(this.i18n.t('users.emailAlreadyVerified'));

    const emailVerificationToken = randomUUID();

    await this.updateUser({
      where: { id: user.id },
      data: {
        emailVerificationToken,
      },
    });

    await this.mailService.sendVerificationEmail(
      user,
      emailVerificationToken,
      userAgent,
    );
  }

  async updateUser(params: {
    data: Prisma.UserUpdateInput;
    where: Prisma.UserWhereUniqueInput;
  }): Promise<User> {
    const { data, where } = params;

    return await this.prisma.user.update({
      data,
      where,
    });
  }

  async deleteUser(where: Prisma.UserWhereUniqueInput): Promise<User> {
    return await this.prisma.user.delete({
      where,
    });
  }
}
