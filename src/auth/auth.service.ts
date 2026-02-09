import { Injectable } from '@nestjs/common';
import { AuthService as BetterAuthService } from '@thallesp/nestjs-better-auth';

import type { Auth } from './index';

@Injectable()
export class AuthService {
  constructor(private readonly betterAuthService: BetterAuthService<Auth>) {}
}
