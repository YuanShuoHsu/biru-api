import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';

import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { jwtConstants } from '../constants';
import { JwtPayload } from '../types';

type RequestWithCookies = Omit<Request, 'cookies'> & {
  cookies: Record<string, string>;
};

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor() {
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

  validate(req: RequestWithCookies, payload: JwtPayload) {
    const refreshToken = req.cookies.refresh_token;

    return { id: payload.sub, email: payload.email, refreshToken };
  }
}
