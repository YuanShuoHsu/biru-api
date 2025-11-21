import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';

import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from 'src/users/users.service';

import jwtConstantsConfig from '../jwtConstants.config';
import type {
  RefreshJwtPayload,
  RefreshUser,
  RequestWithCookies,
} from '../types';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    @Inject(jwtConstantsConfig.KEY)
    jwtConstants: ConfigType<typeof jwtConstantsConfig>,
    private readonly usersService: UsersService,
  ) {
    super({
      ignoreExpiration: false,
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: RequestWithCookies) => {
          return req.cookies.refresh_token;
        },
      ]),
      passReqToCallback: true,
      secretOrKey: jwtConstants.refresh.secret!,
    });
  }

  async validate(
    req: RequestWithCookies,
    payload: RefreshJwtPayload,
  ): Promise<RefreshUser> {
    const refreshToken = req.cookies.refresh_token;
    if (!refreshToken) throw new UnauthorizedException();

    const user = await this.usersService.user({ id: payload.sub });
    if (!user) throw new UnauthorizedException();

    const rememberMe = payload.rememberMe;
    if (rememberMe === undefined) throw new UnauthorizedException();

    return {
      ...user,
      refreshToken,
      rememberMe,
    };
  }
}
