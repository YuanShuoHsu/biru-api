import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';

import { ExtractJwt, Strategy } from 'passport-jwt';
import { User } from 'prisma/generated/client';
import { UsersService } from 'src/users/users.service';

import jwtConstantsConfig from '../jwtConstants.config';
import type { JwtPayload } from '../types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(jwtConstantsConfig.KEY)
    jwtConstants: ConfigType<typeof jwtConstantsConfig>,
    private readonly usersService: UsersService,
  ) {
    super({
      ignoreExpiration: false,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtConstants.access.secret!,
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.usersService.user({ id: payload.sub });
    if (!user) throw new UnauthorizedException();

    return user;
  }
}
