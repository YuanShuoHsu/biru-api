import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Provider, User } from '@prisma/client';

import type { Response } from 'express';

import { AccountsService } from 'src/accounts/accounts.service';
import { normalizeEmail } from 'src/common/utils/email';
import { compare, hash } from 'src/common/utils/hashing';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from 'src/users/users.service';

import { jwtConstants } from './constants';
import { GoogleUserPayload } from './types';

@Injectable()
export class AuthService {
  constructor(
    private accountsService: AccountsService,
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async validateUser(email: string, pass: string): Promise<User | null> {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.usersService.user({ email: normalizedEmail });
    if (!user) return null;

    const account = await this.accountsService.account({
      userId_providerId: { userId: user.id, providerId: Provider.LOCAL },
    });
    if (!account?.password) return null;

    const isMatch = await compare(pass, account.password);
    if (!isMatch) return null;

    return user;
  }

  async login(
    user: User,
    meta: { ip: string; userAgent?: string },
    res: Response,
  ): Promise<{ access_token: string }> {
    const payload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwtConstants.access.secret,
        expiresIn: jwtConstants.access.expiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: jwtConstants.refresh.secret,
        expiresIn: jwtConstants.refresh.expiresIn,
      }),
    ]);

    const { exp: refreshTokenExpiresAtSeconds } =
      await this.jwtService.verifyAsync<{
        exp: number;
      }>(refreshToken, { secret: jwtConstants.refresh.secret });
    const refreshTokenExpiresAt = new Date(refreshTokenExpiresAtSeconds * 1000);

    const refreshTokenHash = await hash(refreshToken);

    await this.prisma.session.create({
      data: {
        expiresAt: refreshTokenExpiresAt,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        userId: user.id,
        token: refreshTokenHash,
      },
    });

    res.cookie('refresh_token', refreshToken, {
      expires: refreshTokenExpiresAt,
      httpOnly: true,
      path: '/auth',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return { access_token: accessToken };
  }

  async loginWithGoogle(
    {
      accessToken,
      accessTokenExpiresAt,
      accountId,
      email,
      emailVerified,
      firstName,
      idToken,
      image,
      lastName,
      refreshToken,
      scope,
    }: GoogleUserPayload,
    meta: { ip: string; userAgent?: string },
    res: Response,
  ) {
    const normalizedEmail = normalizeEmail(email);
    let user = await this.usersService.user({ email: normalizedEmail });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          ...(emailVerified ? { emailVerified } : {}),
          ...(firstName ? { firstName } : {}),
          ...(image ? { image } : {}),
          ...(lastName ? { lastName } : {}),
          accounts: {
            create: {
              accessToken,
              accessTokenExpiresAt,
              accountId,
              idToken,
              providerId: Provider.GOOGLE,
              ...(refreshToken ? { refreshToken } : {}),
              scope,
            },
          },
        },
        include: { accounts: true },
      });
    } else {
      await this.prisma.account.upsert({
        where: {
          userId_providerId: { userId: user.id, providerId: Provider.GOOGLE },
        },
        update: {
          accessTokenExpiresAt,
          accessToken,
          accountId,
          idToken,
          scope,
          ...(refreshToken ? { refreshToken } : {}),
        },
        create: {
          userId: user.id,
          accessToken,
          accessTokenExpiresAt,
          accountId,
          idToken,
          providerId: Provider.GOOGLE,
          ...(refreshToken ? { refreshToken } : {}),
          scope,
        },
      });
    }

    return this.login(user, meta, res);
  }

  // async refresh(
  //   refreshToken: string,
  // ): Promise<{ access_token: string; refresh_token: string }> {
  //   const payload = await this.jwtService.verifyAsync<JwtPayload>(
  //     refreshToken,
  //     {
  //       secret: jwtConstants.refresh.secret,
  //     },
  //   );

  //   const tokens = await this.prisma.refreshToken.findMany({
  //     where: { userId: payload.sub, isRevoked: false },
  //   });

  //   let matched = false;
  //   for (const record of tokens) {
  //     const isMatch = await bcrypt.compare(refreshToken, String(record.hash));
  //     if (isMatch) {
  //       matched = true;

  //       await this.prisma.refreshToken.update({
  //         where: { id: record.id },
  //         data: { isRevoked: true },
  //       });
  //       break;
  //     }
  //   }
  //   if (!matched) throw new UnauthorizedException();

  //   const user = await this.usersService.user({ id: payload.sub });
  //   if (!user) throw new UnauthorizedException();

  //   const newPayload = { sub: user.id, email: user.email };

  //   const newAccess = await this.jwtService.signAsync(newPayload, {
  //     secret: jwtConstants.access.secret,
  //     expiresIn: jwtConstants.access.expiresIn,
  //   });

  //   const newRefresh = await this.jwtService.signAsync(newPayload, {
  //     secret: jwtConstants.refresh.secret,
  //     expiresIn: jwtConstants.refresh.expiresIn,
  //   });

  //   await this.prisma.refreshToken.create({
  //     data: {
  //       userId: user.id,
  //       hash: await bcrypt.hash(newRefresh, 10),
  //     },
  //   });

  //   return { access_token: newAccess, refresh_token: newRefresh };
  // }

  // async logout(userId: string) {
  //   return await this.prisma.refreshToken.updateMany({
  //     where: { userId, isRevoked: false },
  //     data: { isRevoked: true },
  //   });
  // }
}
