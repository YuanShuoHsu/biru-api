// https://docs.nestjs.com/recipes/prisma

import { Injectable } from '@nestjs/common';

import { randomUUID } from 'crypto';
import { Prisma, Provider, User } from 'prisma/generated/client';
import { normalizeEmail } from 'src/common/utils/email';
import { hash } from 'src/common/utils/hashing';
import { MailsService } from 'src/mails/mails.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private mailsService: MailsService,
    private prisma: PrismaService,
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
      redirect,
      ...rest
    }: Omit<Prisma.UserCreateInput, 'accounts' | 'email'> & {
      email: string;
      password: string;
      redirect?: string;
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

    await this.mailsService.sendEmail(
      user,
      emailVerificationToken,
      userAgent,
      redirect,
    );

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
