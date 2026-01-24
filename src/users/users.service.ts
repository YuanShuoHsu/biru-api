// https://docs.nestjs.com/recipes/prisma

import { ConflictException, Injectable } from '@nestjs/common';

import { randomUUID } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { normalizeEmail } from 'src/common/utils/email';
import { hash } from 'src/common/utils/hashing';
import { Prisma, Provider, User } from 'src/generated/prisma/client';
import { MailsService } from 'src/mails/mails.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { VerificationsService } from 'src/verifications/verifications.service';

import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private i18n: I18nService,
    private mailsService: MailsService,
    private prisma: PrismaService,
    private verificationsService: VerificationsService,
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
      countryCode,
      email,
      password,
      phoneNumber,
      redirect,
      ...rest
    }: CreateUserDto,
    userAgent: string,
  ): Promise<User> {
    const normalizedEmail = normalizeEmail(email);
    const hashedPassword = await hash(password);

    const emailExists = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (emailExists)
      throw new ConflictException(this.i18n.t('users.emailAlreadyExists'));

    const phoneExists = await this.prisma.user.findUnique({
      where: {
        countryCode_phoneNumber: {
          countryCode,
          phoneNumber,
        },
      },
    });

    if (phoneExists)
      throw new ConflictException(
        this.i18n.t('users.phoneNumberAlreadyExists'),
      );

    const user = await this.createUser({
      ...rest,
      accounts: {
        create: {
          accountId: normalizedEmail,
          password: hashedPassword,
          providerAccountId: Provider.LOCAL,
        },
      },
      countryCode,
      email: normalizedEmail,
      phoneNumber,
    });

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

    await this.mailsService.sendEmail(user, token, userAgent, redirect);

    return user;
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
