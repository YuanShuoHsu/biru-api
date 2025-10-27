// https://docs.nestjs.com/recipes/prisma

import { Injectable } from '@nestjs/common';
import { Prisma, Provider, User } from '@prisma/client';

import { hash } from 'src/common/utils/hashing';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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

  async createUser({
    email,
    password,
    ...rest
  }: Omit<Prisma.UserCreateInput, 'accounts'> & {
    password: string;
  }): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();
    const hashedPassword = await hash(password);

    return this.prisma.user.create({
      data: {
        ...rest,
        email: normalizedEmail,
        accounts: {
          create: {
            accountId: normalizedEmail,
            password: hashedPassword,
            providerId: Provider.LOCAL,
          },
        },
      },
    });
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
