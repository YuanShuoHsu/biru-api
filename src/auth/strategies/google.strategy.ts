import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Provider } from '@prisma/client';

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
    params: GoogleCallbackParameters,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const { id_token, scope } = params;
    const { id, emails, name, photos } = profile;

    const user = {
      accessToken,
      accountId: id,
      email: emails?.[0]?.value,
      emailVerified: emails?.[0]?.verified,
      firstName: name?.givenName,
      idToken: id_token,
      image: photos?.[0].value,
      lastName: name?.familyName,
      providerId: Provider.GOOGLE,
      refreshToken,
      scope,
    };

    done(null, user);
  }
}
