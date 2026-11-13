import {
  MAILER_OPTIONS,
  MailerService,
  type ISendMailOptions,
  type MailerOptions,
} from '@nestjs-modules/mailer';
import { BadGatewayException, Global, Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
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
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: MailsService;
  let sent: { subject: string; html: string }[];
  let sendMail: MailerService['sendMail'];

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
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
              MAIL_USER: 'support@example.com',
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
    sendMail = vi
      .spyOn(moduleRef.get(MailerService), 'sendMail')
      .mockImplementation(
        (data: ISendMailOptions) =>
          new Promise((resolve, reject) => {
            const mail = { data: { ...data } as { html?: string } };
            const done = (error?: unknown) => {
              if (error) return reject(error);
              sent.push({ subject: data.subject!, html: mail.data.html! });
              resolve({} as Awaited<ReturnType<MailerService['sendMail']>>);
            };
            if (mail.data.html) return done();
            options.template!.adapter!.compile(mail, done, options);
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
    await db.insert(schema.organization).values({
      id: 'store',
      name: 'Biru',
      slug: 'biru',
      createdAt: new Date(),
      addressCountry: 'TW',
      addressLocality: '中正區',
      addressRegion: '臺北市',
      postalCode: '100',
      streetAddress: '忠孝西路一段 1 號',
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
        organization: { id: 'store', name: 'Biru' },
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

  it('邀請信頁尾顯示邀請門市的地址，不再是範本假地址', async () => {
    await sendInvitationEmail('Invitee@Example.com', 'en-US,en;q=0.9');
    await sendInvitationEmail('new@example.com', 'en-US,en;q=0.9');

    expect(sent[0].html).toContain(
      'Biru<br>台湾, 100, 臺北市, 中正區, 忠孝西路一段 1 號',
    );
    expect(sent[1].html).toContain(
      'Biru<br>忠孝西路一段 1 號, 中正區, 臺北市, 100, Taiwan',
    );
    expect(sent.map(({ html }) => html).join()).not.toContain('Street Rd.');
  });

  it('門市地址的 HTML 會被跳脫，國家代碼不合法時照原樣顯示', async () => {
    await db
      .update(schema.organization)
      .set({ addressCountry: 'Taiwan', streetAddress: '<b>1 號</b>' })
      .where(eq(schema.organization.id, 'store'));
    onTestFinished(() =>
      db
        .update(schema.organization)
        .set({ addressCountry: 'TW', streetAddress: '忠孝西路一段 1 號' })
        .where(eq(schema.organization.id, 'store')),
    );

    await sendInvitationEmail('new@example.com', 'en-US,en;q=0.9');

    expect(sent[0].html).toContain('&lt;b&gt;1 號&lt;/b&gt;');
    expect(sent[0].html).toContain(', Taiwan');
  });

  it('其他驗證信頁尾只留產品名稱', async () => {
    await sendVerificationEmail('en');

    expect(sent[0].html).not.toContain('Street Rd.');
  });

  it('聯絡客服的連結寄到寄件信箱，不指向前台不存在的頁面', async () => {
    await sendVerificationEmail('en');

    expect(sent[0].html).toContain('href="mailto:support@example.com"');
    expect(sent[0].html).not.toContain('/company/contact');
  });

  it('邀請信以受邀者的語系顯示角色', async () => {
    await sendInvitationEmail('Invitee@Example.com', 'en-US,en;q=0.9');
    await sendInvitationEmail('new@example.com', 'en-US,en;q=0.9');

    expect(sent[0].html).toContain('メンバー');
    expect(sent[0].html).not.toMatch(/\bmember\b/);
    expect(sent[1].html).toContain('as a member.');
  });

  const spyLoggerError = () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    onTestFinished(() => error.mockRestore());
    return error;
  };

  const smtpError = () =>
    Object.assign(
      new Error(
        "Can't send mail - all recipients were rejected: 550 <ann@example.com>",
      ),
      {
        code: 'EENVELOPE',
        response: '550 5.1.1 <ann@example.com> unknown user, auth smtp-user',
        responseCode: 550,
      },
    );

  it('寄信失敗時記錄種類與遮罩後的收件人，不往外丟', async () => {
    const error = spyLoggerError();
    vi.mocked(sendMail).mockRejectedValueOnce(smtpError());

    await expect(sendVerificationEmail('ja')).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledOnce();
    const [message] = error.mock.calls[0] as [string];
    expect(message).toContain('send-verification-email');
    expect(message).toContain('a***@example.com');
    expect(message).toContain('all recipients were rejected');
    expect(message).not.toContain('ann@example.com');
  });

  it('寄信失敗的 log 遮掉 SMTP 回應帶出的網址', async () => {
    const error = spyLoggerError();
    vi.mocked(sendMail).mockRejectedValueOnce(
      new Error(
        '554 5.7.1 Message rejected: http://localhost:3000/ja/auth/reset-password?token=secret blocked',
      ),
    );

    await sendVerificationEmail('ja');

    const [message] = error.mock.calls[0] as [string];
    expect(message).toContain('554 5.7.1 Message rejected: [url] blocked');
    expect(message).not.toMatch(/localhost|secret/);
  });

  it('非 Error 的寄信失敗也記 log 且不往外丟', async () => {
    const error = spyLoggerError();
    vi.mocked(sendMail).mockRejectedValueOnce('socket closed');

    await expect(sendVerificationEmail('ja')).resolves.toBeUndefined();

    expect(error.mock.calls[0][0]).toContain('socket closed');
  });

  it('測試信寄送失敗時回 502，只附 SMTP 錯誤碼', async () => {
    vi.mocked(sendMail).mockRejectedValueOnce(smtpError());

    const error = await service
      .sendTestEmail({ email: 'ann@example.com' }, 'en')
      .catch((error: unknown) => error);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as BadGatewayException).getStatus()).toBe(502);
    const response = (error as BadGatewayException).getResponse();
    expect(response).toMatchObject({
      error: 'Bad Gateway',
      smtp: { code: 'EENVELOPE', responseCode: 550 },
    });
    expect(JSON.stringify(response)).not.toMatch(/ann@example\.com|smtp-user/);
  });

  it('測試信寄送因非 Error 失敗時仍回 502', async () => {
    vi.mocked(sendMail).mockRejectedValueOnce('socket closed');

    const error = await service
      .sendTestEmail({ email: 'ann@example.com' }, 'en')
      .catch((error: unknown) => error);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as BadGatewayException).getStatus()).toBe(502);
  });

  describe('sendPointsExpiryReminder', () => {
    const expiresAt = new Date('2026-12-03T15:59:00Z');

    beforeAll(async () => {
      await db.insert(schema.user).values([
        {
          id: 'unsubscribed',
          email: 'unsubscribed@example.com',
          emailSubscribed: false,
          firstName: 'Bob',
          name: 'Bob',
        },
        {
          id: 'banned',
          email: 'banned@example.com',
          banned: true,
          firstName: 'Cid',
          name: 'Cid',
        },
        {
          id: 'unbanned',
          email: 'unbanned@example.com',
          banned: true,
          banExpires: new Date(Date.now() - 60_000),
          firstName: 'Dee',
          name: 'Dee',
        },
      ]);
    });

    it('用會員的 lang，附我的點數連結，不附取消訂閱', async () => {
      await expect(
        service.sendPointsExpiryReminder({
          userId: 'invitee',
          points: 1200,
          expiresAt,
        }),
      ).resolves.toBe(true);

      expect(sendMail).toHaveBeenLastCalledWith(
        expect.objectContaining({ to: 'invitee@example.com' }),
      );
      expect(sent[0].subject).toBe('1,200 ポイントが 2026/12/03 に失効します');
      expect(sent[0].html).toContain(
        'href="http://localhost:3000/ja/auth/points/transactions"',
      );
      expect(sent[0].html).not.toContain('auth/settings');
    });

    it('停權中的會員不寄；停權到期或 emailSubscribed 為 false 的照寄', async () => {
      const remind = (userId: string) =>
        service.sendPointsExpiryReminder({ userId, points: 10, expiresAt });

      await expect(remind('banned')).resolves.toBe(false);
      expect(sent).toEqual([]);

      await expect(remind('unbanned')).resolves.toBe(true);
      await expect(remind('unsubscribed')).resolves.toBe(true);
      expect(sent).toHaveLength(2);
    });

    it('寄送失敗時往外丟，讓呼叫端不標記已提醒', async () => {
      vi.mocked(sendMail).mockRejectedValueOnce(smtpError());

      await expect(
        service.sendPointsExpiryReminder({
          userId: 'invitee',
          points: 10,
          expiresAt,
        }),
      ).rejects.toThrow(
        "Failed to send points-expiry-reminder email to i***@example.com: Can't send mail - all recipients were rejected: 550 <a***@example.com>",
      );
    });
  });

  it('出勤通知寄送失敗時往外丟遮罩後的錯誤', async () => {
    vi.mocked(sendMail).mockRejectedValueOnce(smtpError());

    await expect(
      service.sendMissingClockOut({
        recipient: { email: 'ann@example.com', lang: 'en' },
        organizationName: 'Biru',
        path: '/attendance',
        startsAt: new Date('2026-11-01T01:00:00Z'),
        endsAt: new Date('2026-11-01T09:00:00Z'),
      }),
    ).rejects.toThrow(
      "Failed to send attendance-notification email to a***@example.com: Can't send mail - all recipients were rejected: 550 <a***@example.com>",
    );
  });

  it('平台總覽逐店列出前一日比較、尖峰、熱銷、每筆補扣點與低庫存食材，統計失敗的門市註明無法取得', async () => {
    const sales = {
      current: { orders: 0, revenue: 0 },
      previous: { orders: 0, revenue: 0 },
      peakHour: { hour: 0, orders: 0 },
      refundedOrders: 0,
      topItems: [],
    };
    const store = {
      currency: 'TWD',
      path: '/dashboard',
      pointAdjustments: [],
      lowStock: [],
    };

    await service.sendPlatformDailyDigest({
      recipient: { email: 'root@example.com', lang: 'zh-TW' },
      date: new Date('2026-10-21T16:00:00Z'),
      path: '/organizations',
      stores: [
        {
          ...store,
          organizationName: 'Biru',
          sales: {
            current: { orders: 2, revenue: 300 },
            previous: { orders: 1, revenue: 150 },
            peakHour: { hour: 14, orders: 2 },
            refundedOrders: 1,
            topItems: [
              { name: '拿鐵', sold: 2 },
              { name: '摩卡', sold: 1 },
            ],
          },
          pointAdjustments: [
            { adjuster: 'Ann', member: 'Bob', points: 50, reason: '補登' },
            { adjuster: null, member: 'Bob', points: -20, reason: null },
          ],
        },
        {
          ...store,
          organizationName: 'Other',
          sales,
          lowStock: [
            {
              name: '鮮奶',
              inventoryLevel: '100',
              lowStockThreshold: '500',
              unitCode: 'MLT',
              supplierName: '鮮奶坊',
            },
            {
              name: '糖',
              inventoryLevel: '0',
              lowStockThreshold: '1',
              unitCode: 'KGM',
              supplierName: null,
            },
          ],
        },
        {
          ...store,
          organizationName: 'Failed',
          sales: null,
          lowStock: [
            {
              name: '燕麥奶',
              inventoryLevel: '0',
              lowStockThreshold: '1',
              unitCode: 'LTR',
              supplierName: null,
            },
          ],
        },
      ],
    });

    const items = [...sent[0].html.matchAll(/<li>(.*?)<\/li>/gs)].map(
      ([, item]) => item.trim(),
    );
    expect(items).toEqual([
      '營收：$300（前一日 $150）',
      '訂單：2 筆（前一日 1 筆）',
      '客單價：$150',
      '尖峰時段：14:00–15:00（2 筆）',
      '退款：1 筆',
      '熱銷品項：拿鐵 2 份和摩卡 1 份',
      '點數人工調整：2 筆，合計 +30 點',
      'Ann 為 Bob 調整 +50 點：補登',
      '— 為 Bob 調整 -20 點：',
      '營收：$0（前一日 $0）',
      '訂單：0 筆（前一日 0 筆）',
      '退款：0 筆',
      '目前低庫存食材：2 項',
      '鮮奶：剩 100 mL（警示量 500 mL，缺 400 mL），供應商：鮮奶坊',
      '糖：剩 0 kg（警示量 1 kg，缺 1 kg），供應商：未指定供應商',
      '這家門市的營業統計暫時無法取得，請到儀表板查看。',
      '目前低庫存食材：1 項',
      '燕麥奶：剩 0 L（警示量 1 L，缺 1 L），供應商：未指定供應商',
    ]);
  });

  it('測試信用請求者的 lang', async () => {
    await service.sendTestEmail({ email: 'ann@example.com' }, 'ja');
    await service.sendTestEmail({ email: 'ann@example.com' }, undefined);

    expect(sent.map(({ subject }) => subject)).toEqual([
      'Biru Coffee SMTP テスト',
      'Biru Coffee SMTP 測試',
    ]);
    expect(sent[0].html).toContain('SMTP の設定は正しく行われています');
  });
});
