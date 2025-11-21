import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';

import { ExtractJwt, Strategy } from 'passport-jwt';
import { User } from 'prisma/generated/client';
import { UsersService } from 'src/users/users.service';

import { jwtConstants } from '../constants';
import type { JwtPayload } from '../types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.access.secret,
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.usersService.user({ id: payload.sub });
    if (!user) throw new UnauthorizedException();

    return user;
  }
}
