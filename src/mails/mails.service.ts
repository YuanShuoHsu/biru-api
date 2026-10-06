import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { I18nService } from 'nestjs-i18n';
import type { AttendanceNotificationKind } from 'src/attendance/attendance-notification.events';
import { PRODUCT_NAME } from 'src/common/constants/product';
import { PLATFORM_TIMEZONE } from 'src/common/constants/timezone';
import { DEFAULT_LANGUAGE, type Language } from 'src/db/schema/enums';
import type { User } from 'src/db/schema/users';
import { I18nTranslations } from 'src/generated/i18n.generated';
import { UAParser } from 'ua-parser-js';

import { SendTestEmailDto } from './dto/send-test-email.dto';

@Injectable()
export class MailsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly mailerService: MailerService,
  ) {}

  public async afterEmailVerification(
    {
      user: { email, name },
    }: {
      user: Pick<User, 'email' | 'name'>;
    },
    request?: Request,
  ): Promise<void> {
    const productName = PRODUCT_NAME;

    const baseUrl = this.configService.get<string>('NEXT_URL');
    const lang = request?.headers.get('accept-language') || DEFAULT_LANGUAGE;
    const home_url = `${baseUrl}/${lang}`;
    const support_url = `${baseUrl}/${lang}/company/contact`;

    const userAgent = request?.headers.get('user-agent') || undefined;
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    const browser_name = result.browser?.name || 'Unknown';
    const operating_system = result.os?.name || 'Unknown';

    await this.mailerService
      .sendMail({
        to: email,
        subject: this.i18n.t('mail.after_email_verification.subject', {
          args: { productName },
        }),
        template: 'after-email-verification',
        context: {
          browser_name,
          home_url,
          i18nLang: lang,
          name,
          operating_system,
          productName,
          support_url,
          url: home_url,
        },
      })
      .then(() => {})
      .catch(() => {});
  }

  public async onExistingUserSignUp(
    {
      user: { email, name },
    }: {
      user: Pick<User, 'email' | 'name'>;
    },
    request?: Request,
  ): Promise<void> {
    const productName = PRODUCT_NAME;

    const baseUrl = this.configService.get<string>('NEXT_URL');
    const lang = request?.headers.get('accept-language') || DEFAULT_LANGUAGE;
    const home_url = `${baseUrl}/${lang}`;
    const sign_in_url = `${baseUrl}/${lang}/auth/sign-in`;
    const support_url = `${baseUrl}/${lang}/company/contact`;

    const userAgent = request?.headers.get('user-agent') || undefined;
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    const browser_name = result.browser?.name || 'Unknown';
    const operating_system = result.os?.name || 'Unknown';

    await this.mailerService
      .sendMail({
        to: email,
        subject: this.i18n.t('mail.on_existing_user_sign_up.subject', {
          args: { productName },
        }),
        template: 'on-existing-user-sign-up',
        context: {
          browser_name,
          home_url,
          i18nLang: lang,
          name,
          operating_system,
          productName,
          sign_in_url,
          support_url,
        },
      })
      .then(() => {})
      .catch(() => {});
  }

  public async onPasswordReset(
    {
      user: { email, name },
    }: {
      user: Pick<User, 'email' | 'name'>;
    },
    request?: Request,
  ): Promise<void> {
    const productName = PRODUCT_NAME;

    const baseUrl = this.configService.get<string>('NEXT_URL');
    const lang = request?.headers.get('accept-language') || DEFAULT_LANGUAGE;
    const home_url = `${baseUrl}/${lang}`;
    const sign_in_url = `${baseUrl}/${lang}/auth/sign-in`;
    const support_url = `${baseUrl}/${lang}/company/contact`;

    const userAgent = request?.headers.get('user-agent') || undefined;
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    const browser_name = result.browser?.name || 'Unknown';
    const operating_system = result.os?.name || 'Unknown';

    await this.mailerService
      .sendMail({
        to: email,
        subject: this.i18n.t('mail.on_password_reset.subject', {
          args: { productName },
        }),
        template: 'on-password-reset',
        context: {
          browser_name,
          home_url,
          i18nLang: lang,
          name,
          operating_system,
          productName,
          sign_in_url,
          support_url,
        },
      })
      .then(() => {})
      .catch(() => {});
  }

  public async sendChangeEmailConfirmation(
    {
      user: { email, name },
      newEmail,
      url,
      token,
    }: {
      user: Pick<User, 'email' | 'name'>;
      newEmail: string;
      url: string;
      token: string;
    },
    request?: Request,
  ): Promise<void> {
    const productName = PRODUCT_NAME;

    const baseUrl = this.configService.get<string>('NEXT_URL');
    const lang = request?.headers.get('accept-language') || DEFAULT_LANGUAGE;
    const home_url = `${baseUrl}/${lang}`;
    const support_url = `${baseUrl}/${lang}/company/contact`;

    const parsedUrl = new URL(url);
    const callbackURL = parsedUrl.searchParams.get('callbackURL');
    const verifyParams = new URLSearchParams({
      email,
      token,
      ...(callbackURL && { redirectTo: callbackURL }),
    });
    const verifyEmailUrl = `${baseUrl}/${lang}/auth/verify-email?${verifyParams.toString()}`;

    const userAgent = request?.headers.get('user-agent') || undefined;
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    const browser_name = result.browser?.name || 'Unknown';
    const operating_system = result.os?.name || 'Unknown';

    await this.mailerService
      .sendMail({
        to: email,
        subject: this.i18n.t('mail.send_change_email_confirmation.subject', {
          args: { productName },
        }),
        template: 'send-change-email-confirmation',
        context: {
          browser_name,
          home_url,
          i18nLang: lang,
          name,
          newEmail,
          operating_system,
          productName,
          support_url,
          url: verifyEmailUrl,
        },
      })
      .then(() => {})
      .catch(() => {});
  }

  public async sendDeleteAccountVerification(
    {
      user: { email, name },
      url,
      token,
    }: {
      user: Pick<User, 'email' | 'name'>;
      url: string;
      token: string;
    },
    request?: Request,
  ): Promise<void> {
    const productName = PRODUCT_NAME;

    const baseUrl = this.configService.get<string>('NEXT_URL');
    const lang = request?.headers.get('accept-language') || DEFAULT_LANGUAGE;
    const home_url = `${baseUrl}/${lang}`;
    const support_url = `${baseUrl}/${lang}/company/contact`;

    const parsedUrl = new URL(url);
    const callbackURL = parsedUrl.searchParams.get('callbackURL');
    const deleteParams = new URLSearchParams({
      email,
      token,
      ...(callbackURL && { redirectTo: callbackURL }),
    });
    const deleteAccountUrl = `${baseUrl}/${lang}/auth/delete-account?${deleteParams.toString()}`;

    const userAgent = request?.headers.get('user-agent') || undefined;
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    const browser_name = result.browser?.name || 'Unknown';
    const operating_system = result.os?.name || 'Unknown';

    await this.mailerService
      .sendMail({
        to: email,
        subject: this.i18n.t('mail.send_delete_account_verification.subject', {
          args: { productName },
        }),
        template: 'send-delete-account-verification',
        context: {
          browser_name,
          home_url,
          i18nLang: lang,
          name,
          operating_system,
          productName,
          support_url,
          url: deleteAccountUrl,
        },
      })
      .then(() => {})
      .catch(() => {});
  }

  public async sendInvitationEmail(
    {
      id,
      email,
      role,
      organization: { name: organizationName },
      inviter: {
        user: { name: inviterName },
      },
    }: {
      id: string;
      email: string;
      role: string;
      organization: { name: string };
      inviter: { user: { name: string; email: string } };
    },
    request?: Request,
  ): Promise<void> {
    const productName = PRODUCT_NAME;

    const baseUrl = this.configService.get<string>('NEXT_URL');
    const lang = request?.headers.get('accept-language') || DEFAULT_LANGUAGE;
    const home_url = `${baseUrl}/${lang}`;
    const support_url = `${baseUrl}/${lang}/company/contact`;

    const inviteParams = new URLSearchParams({ email, id });
    const invite_url = `${baseUrl}/${lang}/auth/accept-invitation?${inviteParams.toString()}`;

    await this.mailerService
      .sendMail({
        to: email,
        subject: this.i18n.t('mail.organization_invitation.subject', {
          args: { organizationName, productName },
        }),
        template: 'organization-invitation',
        context: {
          home_url,
          i18nLang: lang,
          inviterName,
          organizationName,
          productName,
          role,
          support_url,
          url: invite_url,
        },
      })
      .then(() => {})
      .catch(() => {});
  }

  public async sendResetPassword(
    {
      user: { email, name },
      url,
      token,
    }: {
      user: Pick<User, 'email' | 'name'>;
      url: string;
      token: string;
    },
    request?: Request,
  ): Promise<void> {
    const productName = PRODUCT_NAME;

    const baseUrl = this.configService.get<string>('NEXT_URL');
    const lang = request?.headers.get('accept-language') || DEFAULT_LANGUAGE;
    const home_url = `${baseUrl}/${lang}`;
    const support_url = `${baseUrl}/${lang}/company/contact`;

    const parsedUrl = new URL(url);
    const callbackURL = parsedUrl.searchParams.get('callbackURL');
    const resetParams = new URLSearchParams({
      email,
      token,
      ...(callbackURL && { redirectTo: callbackURL }),
    });
    const resetPasswordUrl = `${baseUrl}/${lang}/auth/reset-password?${resetParams.toString()}`;

    const userAgent = request?.headers.get('user-agent') || undefined;
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    const browser_name = result.browser?.name || 'Unknown';
    const operating_system = result.os?.name || 'Unknown';

    await this.mailerService
      .sendMail({
        to: email,
        subject: this.i18n.t('mail.send_reset_password.subject', {
          args: { productName },
        }),
        template: 'send-reset-password',
        context: {
          browser_name,
          home_url,
          i18nLang: lang,
          name,
          operating_system,
          productName,
          support_url,
          url: resetPasswordUrl,
        },
      })
      .then(() => {})
      .catch(() => {});
  }

  public async sendTestEmail({ email }: SendTestEmailDto): Promise<void> {
    await this.mailerService
      .sendMail({
        to: email,
        subject: 'Biru Coffee SMTP Test',
        text: 'If you receive this email, your SMTP configuration is correct!',
        html: '<b>If you receive this email, your SMTP configuration is correct!</b>',
      })
      .then(() => {})
      .catch(() => {});
  }

  public async sendVerificationEmail(
    {
      user: { email, name },
      url,
      token,
    }: {
      user: Pick<User, 'email' | 'name'>;
      url: string;
      token: string;
    },
    request?: Request,
  ): Promise<void> {
    const productName = PRODUCT_NAME;

    const baseUrl = this.configService.get<string>('NEXT_URL');
    const lang = request?.headers.get('accept-language') || DEFAULT_LANGUAGE;
    const home_url = `${baseUrl}/${lang}`;
    const support_url = `${baseUrl}/${lang}/company/contact`;

    const parsedUrl = new URL(url);
    const callbackURL = parsedUrl.searchParams.get('callbackURL');
    const verifyParams = new URLSearchParams({
      email,
      token,
      ...(callbackURL && { redirectTo: callbackURL }),
    });
    const verifyEmailUrl = `${baseUrl}/${lang}/auth/verify-email?${verifyParams.toString()}`;

    const userAgent = request?.headers.get('user-agent') || undefined;
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    const browser_name = result.browser?.name || 'Unknown';
    const operating_system = result.os?.name || 'Unknown';

    await this.mailerService
      .sendMail({
        to: email,
        subject: this.i18n.t('mail.send_verification_email.subject', {
          args: { productName },
        }),
        template: 'send-verification-email',
        context: {
          browser_name,
          home_url,
          i18nLang: lang,
          name,
          operating_system,
          productName,
          support_url,
          url: verifyEmailUrl,
        },
      })
      .then(() => {})
      .catch(() => {});
  }

  public async sendAttendanceNotification({
    recipient: { email, lang },
    direction,
    kind,
    employeeName,
    organizationName,
    path,
    reason = '',
    reviewerName = '',
    startsAt,
    endsAt,
    status = 'approved',
  }: {
    recipient: { email: string; lang: Language };
    direction: 'submitted' | 'reviewed';
    kind: AttendanceNotificationKind;
    employeeName: string;
    organizationName: string;
    path: string;
    reason?: string;
    reviewerName?: string;
    startsAt: Date;
    endsAt: Date;
    status?: 'approved' | 'rejected';
  }): Promise<void> {
    const productName = PRODUCT_NAME;
    const url = `${this.configService.get<string>('NEXT_ADMIN_URL')}/${lang}${path}`;
    const options = { lang };
    const args = {
      employeeName,
      organizationName,
      period: new Intl.DateTimeFormat(lang, {
        dateStyle: 'medium',
        hourCycle: 'h23',
        timeStyle: 'short',
        timeZone: PLATFORM_TIMEZONE,
      }).formatRange(startsAt, endsAt),
      productName,
      requestName: this.i18n.t(
        `mail.attendance_notification.kinds.${kind}`,
        options,
      ),
      result: this.i18n.t(
        `mail.attendance_notification.results.${status}`,
        options,
      ),
      reviewerName,
    };
    const translate = { args, lang };

    await this.mailerService
      .sendMail({
        to: email,
        subject: this.i18n.t(
          `mail.attendance_notification.${direction}.subject`,
          translate,
        ),
        template: 'attendance-notification',
        context: {
          action: this.i18n.t(
            `mail.attendance_notification.${direction}.action`,
            options,
          ),
          home_url: url,
          i18nLang: lang,
          intro: this.i18n.t(
            `mail.attendance_notification.${direction}.intro`,
            translate,
          ),
          productName,
          reason:
            reason &&
            this.i18n.t('mail.attendance_notification.reason', {
              args: { reason },
              lang,
            }),
          salutation: this.i18n.t(
            'mail.attendance_notification.salutation',
            translate,
          ),
          title: this.i18n.t(
            `mail.attendance_notification.${direction}.title`,
            translate,
          ),
          trouble_hint: this.i18n.t(
            'mail.attendance_notification.trouble_hint',
            options,
          ),
          url,
        },
      })
      .then(() => {})
      .catch(() => {});
  }

  public async sendWaitlistNotification({
    email,
    kind,
    lang,
    organizationName,
    partySize,
    path,
    ticketNumber,
  }: {
    email: string;
    kind: 'joined' | 'called';
    lang: Language;
    organizationName: string;
    partySize: number;
    path: string;
    ticketNumber: string;
  }): Promise<void> {
    const productName = PRODUCT_NAME;
    const url = `${this.configService.get<string>('NEXT_URL')}/${lang}${path}`;
    const options = { lang };
    const translate = {
      args: { organizationName, partySize, productName, ticketNumber },
      lang,
    };

    await this.mailerService
      .sendMail({
        to: email,
        subject: this.i18n.t(
          `mail.waitlist_notification.${kind}.subject`,
          translate,
        ),
        template: 'waitlist-notification',
        context: {
          action: this.i18n.t(
            `mail.waitlist_notification.${kind}.action`,
            options,
          ),
          detail: this.i18n.t(
            `mail.waitlist_notification.${kind}.detail`,
            translate,
          ),
          home_url: url,
          i18nLang: lang,
          intro: this.i18n.t(
            `mail.waitlist_notification.${kind}.intro`,
            translate,
          ),
          productName,
          salutation: this.i18n.t(
            'mail.waitlist_notification.salutation',
            translate,
          ),
          title: this.i18n.t(
            `mail.waitlist_notification.${kind}.title`,
            translate,
          ),
          trouble_hint: this.i18n.t(
            'mail.waitlist_notification.trouble_hint',
            options,
          ),
          url,
        },
      })
      .then(() => {})
      .catch(() => {});
  }
}
