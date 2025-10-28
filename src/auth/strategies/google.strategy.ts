import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';

import {
  GoogleCallbackParameters,
  Profile,
  Strategy,
  VerifyCallback,
} from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google', 5) {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.getOrThrow('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'openid', 'profile'],
    });
  }

  authorizationParams(): { [key: string]: string } {
    return {
      access_type: 'offline',
      prompt: 'consent',
    };
  }

  validate(
    accessToken: string,
    refreshToken: string,
    { expires_in, id_token, scope }: GoogleCallbackParameters,
    { id, emails, name, photos }: Profile,
    done: VerifyCallback,
  ) {
    const email = emails?.[0]?.value;
    if (!email) return done(new UnauthorizedException(), false);

    const user = {
      accessToken,
      accessTokenExpiresAt: new Date(Date.now() + expires_in * 1000),
      accountId: id,
      email,
      emailVerified: emails?.[0]?.verified,
      firstName: name?.givenName,
      idToken: id_token,
      image: photos?.[0].value,
      lastName: name?.familyName,
      refreshToken,
      scope,
    };

    return done(null, user);
  }
}
