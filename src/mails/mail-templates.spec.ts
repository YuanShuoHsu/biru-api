import { MAILER_OPTIONS, type MailerOptions } from '@nestjs-modules/mailer';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { I18nModule } from 'nestjs-i18n';
import { join } from 'node:path';

import { AdminGuard } from '../common/guards/admin.guard.js';

import { MailsModule } from './mails.module.js';

const SECURITY_NOTICE_TEMPLATES = [
  'after-email-verification',
  'on-existing-user-sign-up',
  'on-password-reset',
  'send-change-email-confirmation',
  'send-delete-account-verification',
  'send-reset-password',
  'send-verification-email',
];

const INJECTED = '<a href="https://evil">x</a>';

describe('mail templates', () => {
  let options: MailerOptions;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [() => ({ MAIL_PREVIEW: 'true' })],
        }),
        I18nModule.forRoot({
          fallbackLanguage: 'zh-TW',
          loaderOptions: { path: join(import.meta.dirname, '../i18n/') },
        }),
        MailsModule,
      ],
    })
      .overrideGuard(AdminGuard)
      .useValue({})
      .compile();
    options = moduleRef.get(MAILER_OPTIONS);
  });

  const render = (template: string, context: Record<string, unknown>) =>
    new Promise<string>((resolve, reject) => {
      const mail = { data: { template, context } as { html?: string } };
      options.template!.adapter!.compile(
        mail,
        (error?: unknown) => (error ? reject(error) : resolve(mail.data.html!)),
        options,
      );
    });

  const base = {
    home_url: 'http://localhost:3000/zh-TW',
    i18nLang: 'zh-TW',
    productName: 'Biru Coffee',
    sign_in_url: 'http://localhost:3000/zh-TW/auth/sign-in',
    support_url: 'http://localhost:3000/zh-TW/company/contact',
    url: 'http://localhost:3000/zh-TW/auth',
  };

  it('邀請人名稱不會在安全提醒裡變成 HTML', async () => {
    const html = await render('organization-invitation', {
      ...base,
      inviterName: INJECTED,
      organizationName: 'Biru',
      role: 'member',
    });

    expect(html).not.toContain('<a href="https://evil"');
    expect(html).toContain('&lt;a href=');
    expect(html).toContain(`href="${base.support_url}"`);
  });

  it('新信箱不會在說明裡變成 HTML', async () => {
    const html = await render('send-change-email-confirmation', {
      ...base,
      browser_name: 'Chrome',
      name: 'Ann',
      newEmail: INJECTED,
      operating_system: 'macOS',
    });

    expect(html).not.toContain('<a href="https://evil"');
    expect(html).toContain('&lt;a href=');
    expect(html).toContain('<strong>');
  });

  it.each(SECURITY_NOTICE_TEMPLATES)(
    '%s 的瀏覽器與作業系統不會變成 HTML',
    async (template) => {
      const html = await render(template, {
        ...base,
        browser_name: INJECTED,
        name: 'Ann',
        newEmail: 'ann@example.com',
        operating_system: '<img src="https://evil/os">',
      });

      expect(html).not.toContain('<a href="https://evil"');
      expect(html).toContain('&lt;a href=');
      expect(html).not.toContain('<img src="https://evil/os">');
      expect(html).toContain('&lt;img src=');
      expect(html).toContain(`href="${base.support_url}"`);
    },
  );

  it('雙括號與三括號裡的名稱都只 escape 一次', async () => {
    const html = await render('organization-invitation', {
      ...base,
      inviterName: "O'Brien & Co",
      organizationName: 'Biru',
      role: 'member',
    });

    expect(html).not.toMatch(/&amp;(amp|#x27|#39);/);
    expect(html.match(/O(&#x27;|&#39;|')Brien &amp; Co/g)).toHaveLength(2);
  });

  it('標題裡的使用者名稱只 escape 一次', async () => {
    const html = await render('send-reset-password', {
      ...base,
      browser_name: 'Chrome',
      name: "O'Brien & Co",
      operating_system: 'macOS',
    });

    expect(html).not.toMatch(/&amp;(amp|#x27|#39);/);
    expect(html).toMatch(/O(&#x27;|&#39;|')Brien &amp; Co/);
  });
});
