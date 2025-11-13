import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtRefreshAuthGuard extends AuthGuard('jwt-refresh') {
  constructor() {
    super();
  }

  handleRequest<TUser = any>(
    err: any,
    user: TUser,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _info: any,
  ): TUser {
    if (err || !user) throw err || new UnauthorizedException();

    return user;
  }
}
