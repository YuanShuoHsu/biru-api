import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Provider, User } from '@prisma/client';

import type { Response } from 'express';

import { AccountsService } from 'src/accounts/accounts.service';
import { normalizeEmail } from 'src/common/utils/email';
import { compare, hash } from 'src/common/utils/hashing';
import { SessionsService } from 'src/sessions/sessions.service';
import { UsersService } from 'src/users/users.service';

import { jwtConstants } from './constants';
import { GoogleUserPayload } from './types';

@Injectable()
export class AuthService {
  constructor(
    private accountsService: AccountsService,
    private jwtService: JwtService,
    private sessionsService: SessionsService,
    private usersService: UsersService,
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
    { id, email }: User,
    {
      ip,
      rememberMe,
      userAgent = '',
    }: { ip: string; rememberMe: boolean; userAgent?: string },
    res: Response,
  ): Promise<{ access_token: string }> {
    const payload = { sub: id, email };

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

    const session = await this.sessionsService.session({
      userId_userAgent: { userId: id, userAgent },
    });

    if (!session) {
      await this.sessionsService.createSession({
        expiresAt: refreshTokenExpiresAt,
        ipAddress: ip,
        token: refreshTokenHash,
        user: { connect: { id } },
        userAgent,
      });
    } else {
      await this.sessionsService.updateSession({
        where: { id: session.id },
        data: {
          expiresAt: refreshTokenExpiresAt,
          ipAddress: ip,
          token: refreshTokenHash,
          userAgent,
        },
      });
    }

    await this.sessionsService.deleteSessions({
      userId: id,
      expiresAt: { lt: new Date() },
    });

    res.cookie('refresh_token', refreshToken, {
      ...(rememberMe ? { expires: refreshTokenExpiresAt } : {}),
      httpOnly: true,
      path: '/api/auth',
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
    meta: { ip: string; rememberMe: boolean; userAgent?: string },
    res: Response,
  ) {
    const normalizedEmail = normalizeEmail(email);
    let user = await this.usersService.user({ email: normalizedEmail });

    if (!user) {
      user = await this.usersService.createUser({
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
      });
    } else {
      const account = await this.accountsService.account({
        userId_providerId: { userId: user.id, providerId: Provider.GOOGLE },
      });

      if (!account) {
        await this.accountsService.createAccount({
          user: { connect: { id: user.id } },
          accessToken,
          accessTokenExpiresAt,
          accountId,
          idToken,
          providerId: Provider.GOOGLE,
          ...(refreshToken ? { refreshToken } : {}),
          scope,
        });
      } else {
        await this.accountsService.updateAccount({
          where: {
            userId_providerId: { userId: user.id, providerId: Provider.GOOGLE },
          },
          data: {
            accessToken,
            accessTokenExpiresAt,
            accountId,
            idToken,
            ...(refreshToken ? { refreshToken } : {}),
            scope,
          },
        });
      }
    }

    return this.login(user, meta, res);
  }

  async refresh(
    refreshToken: string,
    { ip, userAgent = '' }: { ip: string; userAgent?: string },
    res: Response,
  ): Promise<{ access_token: string }> {
    const { sub, email } = await this.jwtService.verifyAsync<{
      sub: string;
      email: string;
    }>(refreshToken, { secret: jwtConstants.refresh.secret });

    const [newAccessToken, newRefreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub, email },
        {
          secret: jwtConstants.access.secret,
          expiresIn: jwtConstants.access.expiresIn,
        },
      ),
      this.jwtService.signAsync(
        { sub, email },
        {
          secret: jwtConstants.refresh.secret,
          expiresIn: jwtConstants.refresh.expiresIn,
        },
      ),
    ]);

    const { exp: newRefreshTokenExpiresAtSeconds } =
      await this.jwtService.verifyAsync<{ exp: number }>(newRefreshToken, {
        secret: jwtConstants.refresh.secret,
      });
    const newRefreshTokenExpiresAt = new Date(
      newRefreshTokenExpiresAtSeconds * 1000,
    );
    const newRefreshTokenHash = await hash(newRefreshToken);

    const sessions = await this.sessionsService.sessions({
      where: { userId: sub },
    });

    for (const { id, token } of sessions) {
      const match = await compare(refreshToken, token);
      if (match) {
        await this.sessionsService.updateSession({
          where: { id },
          data: {
            expiresAt: newRefreshTokenExpiresAt,
            ipAddress: ip,
            token: newRefreshTokenHash,
            userAgent,
          },
        });
        break;
      }
    }

    await this.sessionsService.deleteSessions({
      userId: sub,
      expiresAt: { lt: new Date() },
    });

    res.cookie('refresh_token', newRefreshToken, {
      expires: newRefreshTokenExpiresAt,
      httpOnly: true,
      path: '/api/auth',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return { access_token: newAccessToken };
  }

  async logout(refreshToken: string, res: Response) {
    const { sub } = await this.jwtService.verifyAsync<{ sub: string }>(
      refreshToken,
      { secret: jwtConstants.refresh.secret },
    );

    const sessions = await this.sessionsService.sessions({
      where: { userId: sub },
    });

    for (const { id, token } of sessions) {
      const match = await compare(refreshToken, token);
      if (match) {
        await this.sessionsService.deleteSession({ id });
        break;
      }
    }

    res.clearCookie('refresh_token', {
      httpOnly: true,
      path: '/api/auth',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return { success: true };
  }
}
