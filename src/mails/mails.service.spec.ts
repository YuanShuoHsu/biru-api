import {
  MAILER_OPTIONS,
  MailerService,
  type ISendMailOptions,
  type MailerOptions,
} from '@nestjs-modules/mailer';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { I18nModule } from 'nestjs-i18n';
import { join } from 'node:path';

import { createPGlite } from '../../test/pglite.js';
import { AdminGuard } from '../common/guards/admin.guard.js';
import { type Language } from '../db/schema/enums.js';
import * as schema from '../db/schema/index.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import { MailsModule } from './mails.module.js';
import { MailsService } from './mails.service.js';

describe('MailsService 語系', () => {
  let client: PGlite;
  let service: MailsService;
  let sent: { subject: string; html: string }[];

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });

    @Global()
    @Module({
      providers: [{ provide: DRIZZLE, useValue: db }],
      exports: [DRIZZLE],
    })
    class TestDrizzleModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [
            () => ({
              FALLBACK_LANGUAGE: 'zh-TW',
              MAIL_PREVIEW: 'true',
              NEXT_URL: 'http://localhost:3000',
            }),
          ],
        }),
        I18nModule.forRoot({
          fallbackLanguage: 'zh-TW',
          loaderOptions: { path: join(import.meta.dirname, '../i18n/') },
        }),
        MailsModule,
        TestDrizzleModule,
      ],
    })
      .overrideGuard(AdminGuard)
      .useValue({})
      .compile();

    const options = moduleRef.get<MailerOptions>(MAILER_OPTIONS);
    vi.spyOn(moduleRef.get(MailerService), 'sendMail').mockImplementation(
      (data: ISendMailOptions) =>
        new Promise((resolve, reject) => {
          const mail = { data: { ...data } as { html?: string } };
          options.template!.adapter!.compile(
            mail,
            (error?: unknown) => {
              if (error) return reject(error);
              sent.push({ subject: data.subject!, html: mail.data.html! });
              resolve({} as Awaited<ReturnType<MailerService['sendMail']>>);
            },
            options,
          );
        }),
    );
    service = moduleRef.get(MailsService);

    await db.insert(schema.user).values({
      id: 'invitee',
      email: 'invitee@example.com',
      firstName: 'Ann',
      lang: 'ja',
      name: 'Ann',
    });
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    sent = [];
  });

  const request = (acceptLanguage?: string) =>
    new Request('http://localhost:3001/api/auth', {
      headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {},
    });

  const sendVerificationEmail = (
    lang: Language | undefined,
    acceptLanguage?: string,
  ) =>
    service.sendVerificationEmail(
      {
        user: { email: 'ann@example.com', name: 'Ann', lang },
        url: 'http://localhost:3001/api/auth/verify-email?token=t',
        token: 't',
      },
      request(acceptLanguage),
    );

  it('收件人的 lang 優先於請求的 Accept-Language', async () => {
    await sendVerificationEmail('ja', 'en-US,en;q=0.9');

    expect(sent[0].subject).toBe(
      'Biru Coffeeへようこそ！メールアドレスをご確認ください',
    );
    expect(sent[0].html).toContain('ようこそ、Annさん！');
    expect(sent[0].html).toContain(
      'http://localhost:3000/ja/auth/verify-email',
    );
  });

  it('收件人沒有有效 lang 時解析 Accept-Language', async () => {
    await sendVerificationEmail(undefined, 'en-US,en;q=0.9');

    expect(sent[0].subject).toBe('Welcome to Biru Coffee! Confirm your Email');
    expect(sent[0].html).toContain('Welcome, Ann!');

    await sendVerificationEmail('fr' as Language, 'zh-Hant-HK');

    expect(sent[1].subject).toBe('歡迎來到 Biru Coffee！請確認您的電子郵件');
  });

  it('都沒有時用 FALLBACK_LANGUAGE', async () => {
    await sendVerificationEmail(undefined, 'fr-FR');

    expect(sent[0].subject).toBe('歡迎來到 Biru Coffee！請確認您的電子郵件');
    expect(sent[0].html).toContain('歡迎您，Ann！');
  });

  const sendInvitationEmail = (email: string, acceptLanguage: string) =>
    service.sendInvitationEmail(
      {
        id: 'invitation',
        email,
        role: 'member',
        organization: { name: 'Biru' },
        inviter: { user: { name: 'Owner', email: 'owner@example.com' } },
      },
      request(acceptLanguage),
    );

  it('邀請已註冊的使用者時用受邀者的 lang', async () => {
    await sendInvitationEmail('Invitee@Example.com', 'en-US,en;q=0.9');

    expect(sent[0].subject).toBe('Biru Coffee の Biru に招待されました');
    expect(sent[0].html).toContain('招待が届いています！');
    expect(sent[0].html).toContain(
      'http://localhost:3000/ja/auth/accept-invitation',
    );
  });

  it('受邀者尚未註冊時用邀請人請求的語系', async () => {
    await sendInvitationEmail('new@example.com', 'en-US,en;q=0.9');

    expect(sent[0].subject).toBe("You're invited to join Biru on Biru Coffee");
    expect(sent[0].html).toContain('invited');
  });
});
