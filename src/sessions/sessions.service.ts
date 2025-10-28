import { Injectable } from '@nestjs/common';
import { Prisma, Session } from '@prisma/client';

import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  async sessions(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.SessionWhereUniqueInput;
    where?: Prisma.SessionWhereInput;
    orderBy?: Prisma.SessionOrderByWithRelationInput;
  }): Promise<Session[]> {
    const { skip, take, cursor, where, orderBy } = params;

    return this.prisma.session.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
  }

  async createSession(data: Prisma.SessionCreateInput): Promise<Session> {
    return this.prisma.session.create({
      data,
    });
  }

  async deleteSession(where: Prisma.SessionWhereUniqueInput): Promise<Session> {
    return await this.prisma.session.delete({
      where,
    });
  }

  // create(createSessionDto: CreateSessionDto) {
  //   return 'This action adds a new session';
  // }

  // findAll() {
  //   return `This action returns all sessions`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} session`;
  // }

  // update(id: number, updateSessionDto: UpdateSessionDto) {
  //   return `This action updates a #${id} session`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} session`;
  // }
}
