import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';

import { Profile, Strategy } from 'passport-google-oauth20';

import { User } from '@prisma/client';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    configService: ConfigService,
  ) {
    super({
      clientID: configService.getOrThrow('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'openid', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    { emails, name, photos }: Profile,
  ): Promise<User> {
    const email = emails?.[0]?.value;
    if (!email) throw new UnauthorizedException();

    const user = await this.authService.validateGoogleUser({
      email,
      firstName: name?.givenName,
      lastName: name?.familyName,
      photo: photos?.[0].value,
    });
    if (!user) throw new UnauthorizedException();

    return user;
  }
}
