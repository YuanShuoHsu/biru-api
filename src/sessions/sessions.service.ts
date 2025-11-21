import { Injectable } from '@nestjs/common';

import { Prisma, Session } from 'prisma/generated/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  async session(
    sessionWhereUniqueInput: Prisma.SessionWhereUniqueInput,
  ): Promise<Session | null> {
    return this.prisma.session.findUnique({
      where: sessionWhereUniqueInput,
    });
  }

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

  async updateSession(params: {
    data: Prisma.SessionUpdateInput;
    where: Prisma.SessionWhereUniqueInput;
  }): Promise<Session> {
    const { data, where } = params;

    return await this.prisma.session.update({
      data,
      where,
    });
  }

  async deleteSession(where: Prisma.SessionWhereUniqueInput): Promise<Session> {
    return await this.prisma.session.delete({
      where,
    });
  }

  async deleteSessions(
    where: Prisma.SessionWhereInput,
  ): Promise<{ count: number }> {
    return await this.prisma.session.deleteMany({
      where,
    });
  }
}
