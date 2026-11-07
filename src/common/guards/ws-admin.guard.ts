import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { I18nService } from 'nestjs-i18n';
import { Socket } from 'socket.io';

import type { I18nTranslations } from '../../generated/i18n.generated.js';
import { LanguageResolver } from '../resolvers/language.resolver.js';

const languageResolver = new LanguageResolver();

// 平台管理員（better-auth admin plugin 的 user.role）；gateway 不吃全域 guard，要逐一掛
@Injectable()
export class WsAdminGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private i18n: I18nService<I18nTranslations>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const session = await this.authService.api.getSession({
      headers: fromNodeHeaders(client.handshake.headers),
    });

    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role !== 'admin')
      throw new ForbiddenException({
        error: 'Forbidden',
        code: 'forbidden',
        message: this.i18n.t('common.exceptions.forbidden', {
          lang: languageResolver.resolve(context),
        }),
      });

    return true;
  }
}
