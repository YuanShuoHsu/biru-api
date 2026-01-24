import { Injectable } from '@nestjs/common';

import { I18nService } from 'nestjs-i18n';
import { I18nTranslations } from 'src/generated/i18n.generated';
import { Prisma, Verification } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class VerificationsService {
  constructor(
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly prisma: PrismaService,
  ) {}

  // create(createVerificationDto: CreateVerificationDto) {
  //   return 'This action adds a new verification';
  // }

  // findAll() {
  //   return `This action returns all verifications`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} verification`;
  // }

  // update(id: number, updateVerificationDto: UpdateVerificationDto) {
  //   return `This action updates a #${id} verification`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} verification`;
  // }

  async verification(
    verificationWhereUniqueInput: Prisma.VerificationWhereUniqueInput,
  ): Promise<Verification | null> {
    return this.prisma.verification.findUnique({
      where: verificationWhereUniqueInput,
    });
  }

  async verifications(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.VerificationWhereUniqueInput;
    where?: Prisma.VerificationWhereInput;
    orderBy?: Prisma.VerificationOrderByWithRelationInput;
  }): Promise<Verification[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.verification.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
  }

  async createVerification(
    data: Prisma.VerificationCreateInput,
  ): Promise<Verification> {
    return this.prisma.verification.create({
      data,
    });
  }

  async updateVerification(params: {
    where: Prisma.VerificationWhereUniqueInput;
    data: Prisma.VerificationUpdateInput;
  }): Promise<Verification> {
    const { where, data } = params;
    return this.prisma.verification.update({
      data,
      where,
    });
  }

  async deleteVerification(
    where: Prisma.VerificationWhereUniqueInput,
  ): Promise<Verification> {
    return this.prisma.verification.delete({
      where,
    });
  }

  async deleteVerifications(
    where: Prisma.VerificationWhereInput,
  ): Promise<Prisma.BatchPayload> {
    return this.prisma.verification.deleteMany({
      where,
    });
  }
}
