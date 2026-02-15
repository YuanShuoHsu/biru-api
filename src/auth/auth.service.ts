import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthService as BetterAuthService } from '@thallesp/nestjs-better-auth';

import { I18nService } from 'nestjs-i18n';
import { UsersService } from 'src/users/users.service';

import { ResendEmailDto } from './dto/resend-email.dto';
import type { Auth } from './index';

@Injectable()
export class AuthService {
  constructor(
    private readonly betterAuthService: BetterAuthService<Auth>,
    private readonly usersService: UsersService,
    private readonly i18n: I18nService,
  ) {}

  async resendEmail(
    { callbackURL, identifier }: ResendEmailDto,
    headers: Headers,
  ): Promise<void> {
    const user = await this.usersService.user({ id: identifier });

    if (!user) throw new NotFoundException(this.i18n.t('users.userNotFound'));

    if (user.emailVerified)
      throw new BadRequestException(this.i18n.t('users.emailAlreadyVerified'));

    await this.betterAuthService.api.sendVerificationEmail({
      body: {
        callbackURL,
        email: user.email,
      },
      headers,
    });
  }
}
