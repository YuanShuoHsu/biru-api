import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { AuthService } from '@thallesp/nestjs-better-auth';

import type { I18nService } from 'nestjs-i18n';

import type { I18nTranslations } from '../../generated/i18n.generated.js';
import { WsAdminGuard } from './ws-admin.guard.js';

describe('WsAdminGuard', () => {
  const setup = (session: unknown) => {
    const authService = {
      api: { getSession: vi.fn().mockResolvedValue(session) },
    } as unknown as AuthService;
    const i18n = {
      t: (key: string, { lang }: { lang?: string }) => `${lang}:${key}`,
    } as unknown as I18nService<I18nTranslations>;
    const context = {
      getType: () => 'ws',
      switchToWs: () => ({
        getClient: () => ({
          handshake: { headers: { 'accept-language': 'ja' }, query: {} },
        }),
      }),
    } as unknown as ExecutionContext;

    return () => new WsAdminGuard(authService, i18n).canActivate(context);
  };

  it('平台管理員通過', async () => {
    await expect(setup({ user: { role: 'admin' } })()).resolves.toBe(true);
  });

  it.each([
    ['非平台管理員', { user: { role: 'user' } }],
    ['未登入', null],
  ])('%s回 403，帶代碼與連線語言的訊息', async (_, session) => {
    const error = await setup(session)().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      error: 'Forbidden',
      code: 'forbidden',
      message: 'ja:common.exceptions.forbidden',
    });
  });
});
