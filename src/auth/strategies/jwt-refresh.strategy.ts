import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';

import { ExtractJwt, Strategy } from 'passport-jwt';

import { jwtConstants } from '../constants';
import type { JwtPayload, RefreshUser, RequestWithCookies } from '../types';

import { UsersService } from 'src/users/users.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: RequestWithCookies) => {
          return req.cookies.refresh_token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.refresh.secret,
      passReqToCallback: true,
    });
  }

  async validate(
    req: RequestWithCookies,
    payload: JwtPayload,
  ): Promise<RefreshUser> {
    const refreshToken = req.cookies.refresh_token;
    if (!refreshToken) throw new UnauthorizedException();

    const user = await this.usersService.user({ id: payload.sub });
    if (!user) throw new UnauthorizedException();

    return { ...user, refreshToken };
  }
}
