import { Injectable } from '@nestjs/common';
import { AuthService as BetterAuthService } from '@thallesp/nestjs-better-auth';

import { VerifyEmailDto } from './dto/verify-email.dto';
import type { Auth } from './index';

@Injectable()
export class AuthService {
  constructor(private readonly betterAuthService: BetterAuthService<Auth>) {}

  async verifyEmail({ token }: VerifyEmailDto) {
    return await this.betterAuthService.api.verifyEmail({
      query: { token },
    });
  }
}
