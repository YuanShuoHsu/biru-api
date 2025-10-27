import { Injectable } from '@nestjs/common';
import { Account, Prisma } from '@prisma/client';

import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async account(
    accountWhereUniqueInput: Prisma.AccountWhereUniqueInput,
  ): Promise<Account | null> {
    return this.prisma.account.findUnique({
      where: accountWhereUniqueInput,
    });
  }

  // create(createAccountDto: CreateAccountDto) {
  //   return 'This action adds a new account';
  // }

  // findAll() {
  //   return `This action returns all accounts`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} account`;
  // }

  // update(id: number, updateAccountDto: UpdateAccountDto) {
  //   return `This action updates a #${id} account`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} account`;
  // }
}
