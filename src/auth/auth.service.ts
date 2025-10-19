import * as bcrypt from 'bcrypt';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Provider, User } from '@prisma/client';

import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from 'src/users/users.service';

import { jwtConstants } from './constants';
import { JwtPayload } from './types';

interface GoogleUserInput {
  email: string;
  firstName?: string;
  lastName?: string;
  photo?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async validateUser(
    email: string,
    pass: string,
  ): Promise<Omit<User, 'password'> | null> {
    const user = await this.usersService.user({ email });
    if (!user) return null;

    const { password, ...result } = user;
    const isMatch = await bcrypt.compare(pass, password);
    if (!isMatch) return null;

    return result;
  }

  async validateGoogleUser({
    email,
    firstName,
    lastName,
    photo,
  }: GoogleUserInput): Promise<Omit<User, 'password'> | null> {
    const user = await this.usersService.user({ email });

    if (!user) {
      const createUser = await this.usersService.createUser({
        email,
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(photo ? { photo } : {}),
        password: '',
        provider: Provider.google,
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = createUser;
      return result;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = user;
    return result;
  }

  async login(
    user: User,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const payload = { sub: user.id, email: user.email };

    const access_token = await this.jwtService.signAsync(payload, {
      secret: jwtConstants.access.secret,
      expiresIn: jwtConstants.access.expiresIn,
    });

    const refresh_token = await this.jwtService.signAsync(payload, {
      secret: jwtConstants.refresh.secret,
      expiresIn: jwtConstants.refresh.expiresIn,
    });

    const hash = await bcrypt.hash(refresh_token, 10);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        hash,
      },
    });

    return { ...user, access_token, refresh_token };
  }

  async refresh(
    refreshToken: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const payload = await this.jwtService.verifyAsync<JwtPayload>(
      refreshToken,
      {
        secret: jwtConstants.refresh.secret,
      },
    );

    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub, isRevoked: false },
    });

    let matched = false;
    for (const record of tokens) {
      const isMatch = await bcrypt.compare(refreshToken, String(record.hash));
      if (isMatch) {
        matched = true;

        await this.prisma.refreshToken.update({
          where: { id: record.id },
          data: { isRevoked: true },
        });
        break;
      }
    }
    if (!matched) throw new UnauthorizedException();

    const user = await this.usersService.user({ id: payload.sub });
    if (!user) throw new UnauthorizedException();

    const newPayload = { sub: user.id, email: user.email };

    const newAccess = await this.jwtService.signAsync(newPayload, {
      secret: jwtConstants.access.secret,
      expiresIn: jwtConstants.access.expiresIn,
    });

    const newRefresh = await this.jwtService.signAsync(newPayload, {
      secret: jwtConstants.refresh.secret,
      expiresIn: jwtConstants.refresh.expiresIn,
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        hash: await bcrypt.hash(newRefresh, 10),
      },
    });

    return { access_token: newAccess, refresh_token: newRefresh };
  }

  async logout(userId: string) {
    return await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }
}
