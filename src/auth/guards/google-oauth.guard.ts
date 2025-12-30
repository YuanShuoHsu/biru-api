import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import type { Request } from 'express';

@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  override getAuthenticateOptions(context: ExecutionContext) {
    const { query } = context.switchToHttp().getRequest<Request>();

    const state = Buffer.from(JSON.stringify(query)).toString('base64');

    return { state };
  }
}
