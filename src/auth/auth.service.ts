import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { Response } from 'express';
import { I18nService } from 'nestjs-i18n';
import { Provider, User } from 'prisma/generated/client';
import { AccountsService } from 'src/accounts/accounts.service';
import { normalizeEmail } from 'src/common/utils/email';
import { compare, hash } from 'src/common/utils/hashing';
import { I18nTranslations } from 'src/generated/i18n.generated';
import { SessionsService } from 'src/sessions/sessions.service';
import { UsersService } from 'src/users/users.service';

import jwtConstantsConfig from './jwtConstants.config';
import { GoogleUserPayload, RefreshUser } from './types';

@Injectable()
export class AuthService {
  constructor(
    private accountsService: AccountsService,
    @Inject(jwtConstantsConfig.KEY)
    private readonly jwtConstants: ConfigType<typeof jwtConstantsConfig>,
    private jwtService: JwtService,
    private sessionsService: SessionsService,
    private usersService: UsersService,
    private readonly i18n: I18nService<I18nTranslations>,
  ) {}

  async validateUser(email: string, pass: string): Promise<User> {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.usersService.user({ email: normalizedEmail });
    if (!user)
      throw new UnauthorizedException(this.i18n.t('users.userNotFound'));
    if (!user.emailVerified) {
      throw new ForbiddenException({
        id: user.id,
        message: this.i18n.t('users.emailNotVerified'),
      });
    }

    const account = await this.accountsService.account({
      userId_providerId: { userId: user.id, providerId: Provider.LOCAL },
    });
    if (!account?.password)
      throw new UnauthorizedException(this.i18n.t('users.invalidCredentials'));

    const isMatch = await compare(pass, account.password);
    if (!isMatch)
      throw new UnauthorizedException(this.i18n.t('users.invalidCredentials'));

    return user;
  }

  async login(
    { id, email }: User,
    {
      ip,
      rememberMe,
      userAgent,
    }: { ip: string; rememberMe: boolean; userAgent: string },
    res: Response,
  ): Promise<{ access_token: string }> {
    const payload = { sub: id, email };
    const refreshPayload = { ...payload, rememberMe };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.jwtConstants.access.secret,
        expiresIn: this.jwtConstants.access.expiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.jwtConstants.refresh.secret,
        expiresIn: this.jwtConstants.refresh.expiresIn,
      }),
    ]);

    const { exp: refreshTokenExpiresAtSeconds } =
      await this.jwtService.verifyAsync<{
        exp: number;
      }>(refreshToken, { secret: this.jwtConstants.refresh.secret });
    const refreshTokenExpiresAt = new Date(refreshTokenExpiresAtSeconds * 1000);
    const refreshTokenHash = await hash(refreshToken);

    const session = userAgent
      ? await this.sessionsService.session({
          userId_userAgent: { userId: id, userAgent },
        })
      : null;

    if (!session) {
      await this.sessionsService.createSession({
        expiresAt: refreshTokenExpiresAt,
        ipAddress: ip,
        token: refreshTokenHash,
        user: { connect: { id } },
        ...(userAgent ? { userAgent } : {}),
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
    meta: { ip: string; rememberMe: boolean; userAgent: string },
    res: Response,
  ) {
    const normalizedEmail = normalizeEmail(email);
    let user = await this.usersService.user({ email: normalizedEmail });

    if (!user) {
      user = await this.usersService.createUser({
        email: normalizedEmail,
        ...(emailVerified
          ? { emailVerified: true, emailVerifiedAt: new Date() }
          : {}),
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
      user = await this.usersService.updateUser({
        where: { id: user.id },
        data: {
          ...(emailVerified
            ? { emailVerified: true, emailVerifiedAt: new Date() }
            : {}),
          ...(firstName ? { firstName } : {}),
          ...(image ? { image } : {}),
          ...(lastName ? { lastName } : {}),
        },
      });

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
    { id: sub, email, refreshToken, rememberMe }: RefreshUser,
    { ip }: { ip: string },
    res: Response,
  ): Promise<{ access_token: string }> {
    const [newAccessToken, newRefreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub, email },
        {
          secret: this.jwtConstants.access.secret,
          expiresIn: this.jwtConstants.access.expiresIn,
        },
      ),
      this.jwtService.signAsync(
        { sub, email, rememberMe },
        {
          secret: this.jwtConstants.refresh.secret,
          expiresIn: this.jwtConstants.refresh.expiresIn,
        },
      ),
    ]);

    const { exp: newRefreshTokenExpiresAtSeconds } =
      await this.jwtService.verifyAsync<{ exp: number }>(newRefreshToken, {
        secret: this.jwtConstants.refresh.secret,
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
      ...(rememberMe ? { expires: newRefreshTokenExpiresAt } : {}),
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
      { secret: this.jwtConstants.refresh.secret },
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
