import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { I18nService } from 'nestjs-i18n';
import type { AttendanceNotificationKind } from '../attendance/attendance-notification.events.js';
import { PRODUCT_NAME } from '../common/constants/product.js';
import { PLATFORM_TIMEZONE } from '../common/constants/timezone.js';
import { toLanguage } from '../common/utils/language.js';
import { type Language } from '../db/schema/enums.js';
import type { UnitCode } from '../db/schema/inventory.js';
import type { User } from '../db/schema/users.js';
import { I18nTranslations } from '../generated/i18n.generated.js';
import { UAParser } from 'ua-parser-js';

import { SendTestEmailDto } from './dto/send-test-email.dto.js';

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
    const lang = toLanguage(request?.headers.get('accept-language'));
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
    const lang = toLanguage(request?.headers.get('accept-language'));
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
    const lang = toLanguage(request?.headers.get('accept-language'));
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
    const lang = toLanguage(request?.headers.get('accept-language'));
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
    const lang = toLanguage(request?.headers.get('accept-language'));
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
    const lang = toLanguage(request?.headers.get('accept-language'));
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
    const lang = toLanguage(request?.headers.get('accept-language'));
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
    const lang = toLanguage(request?.headers.get('accept-language'));
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

  public async sendAnnualLeaveEntitlement({
    recipient: { email, lang },
    organizationName,
    path,
    periodStart,
    periodEnd,
    grantedMinutes,
  }: {
    recipient: { email: string; lang: Language };
    organizationName: string;
    path: string;
    periodStart: Date;
    periodEnd: Date;
    grantedMinutes: number;
  }): Promise<void> {
    const productName = PRODUCT_NAME;
    const url = `${this.configService.get<string>('NEXT_ADMIN_URL')}/${lang}${path}`;
    const options = { lang };
    const hours = Math.floor(grantedMinutes / 60);
    const minutes = grantedMinutes % 60;
    const args = {
      duration: this.i18n.t(
        minutes
          ? 'mail.annual_leave_entitlement.duration_minutes'
          : 'mail.annual_leave_entitlement.duration',
        { args: { hours, minutes }, lang },
      ),
      organizationName,
      period: new Intl.DateTimeFormat(lang, {
        dateStyle: 'medium',
        timeZone: PLATFORM_TIMEZONE,
      }).formatRange(periodStart, new Date(periodEnd.getTime() - 1)),
      productName,
    };
    const translate = { args, lang };

    await this.mailerService.sendMail({
      to: email,
      subject: this.i18n.t('mail.annual_leave_entitlement.subject', translate),
      template: 'attendance-notification',
      context: {
        action: this.i18n.t('mail.annual_leave_entitlement.action', options),
        home_url: url,
        i18nLang: lang,
        intro: this.i18n.t('mail.annual_leave_entitlement.intro', translate),
        productName,
        reason: this.i18n.t('mail.annual_leave_entitlement.rules', options),
        salutation: this.i18n.t(
          'mail.attendance_notification.salutation',
          translate,
        ),
        title: this.i18n.t('mail.annual_leave_entitlement.title', translate),
        trouble_hint: this.i18n.t(
          'mail.attendance_notification.trouble_hint',
          options,
        ),
        url,
      },
    });
  }

  public async sendMissingClockOut({
    recipient: { email, lang },
    organizationName,
    path,
    startsAt,
    endsAt,
  }: {
    recipient: { email: string; lang: Language };
    organizationName: string;
    path: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<void> {
    const productName = PRODUCT_NAME;
    const url = `${this.configService.get<string>('NEXT_ADMIN_URL')}/${lang}${path}`;
    const options = { lang };
    const translate = {
      args: {
        organizationName,
        period: new Intl.DateTimeFormat(lang, {
          dateStyle: 'medium',
          hourCycle: 'h23',
          timeStyle: 'short',
          timeZone: PLATFORM_TIMEZONE,
        }).formatRange(startsAt, endsAt),
        productName,
      },
      lang,
    };

    await this.mailerService.sendMail({
      to: email,
      subject: this.i18n.t('mail.missing_clock_out.subject', translate),
      template: 'attendance-notification',
      context: {
        action: this.i18n.t('mail.missing_clock_out.action', options),
        home_url: url,
        i18nLang: lang,
        intro: this.i18n.t('mail.missing_clock_out.intro', translate),
        productName,
        reason: this.i18n.t('mail.missing_clock_out.rules', options),
        salutation: this.i18n.t(
          'mail.attendance_notification.salutation',
          translate,
        ),
        title: this.i18n.t('mail.missing_clock_out.title', translate),
        trouble_hint: this.i18n.t(
          'mail.attendance_notification.trouble_hint',
          options,
        ),
        url,
      },
    });
  }

  public async sendLowStockDigest({
    recipient: { email, lang },
    organizationName,
    path,
    ingredients,
  }: {
    recipient: { email: string; lang: Language };
    organizationName: string;
    path: string;
    ingredients: {
      name: string;
      inventoryLevel: string;
      lowStockThreshold: string;
      unitCode: UnitCode;
      supplierId: string | null;
      supplierName: string | null;
    }[];
  }): Promise<void> {
    const productName = PRODUCT_NAME;
    const url = `${this.configService.get<string>('NEXT_ADMIN_URL')}/${lang}${path}`;
    const options = { lang };
    const translate = {
      args: { count: ingredients.length, organizationName, productName },
      lang,
    };
    const numberFormat = new Intl.NumberFormat(lang, {
      maximumFractionDigits: 3,
    });
    const groups = new Map<
      string | null,
      { supplierName: string | null; items: string[] }
    >();

    for (const {
      name,
      inventoryLevel,
      lowStockThreshold,
      unitCode,
      supplierId,
      supplierName,
    } of ingredients) {
      const unit = this.i18n.t(
        `mail.low_stock_digest.units.${unitCode}`,
        options,
      );
      const item = this.i18n.t('mail.low_stock_digest.item', {
        args: {
          level: numberFormat.format(Number(inventoryLevel)),
          name,
          shortage: numberFormat.format(
            Number(lowStockThreshold) - Number(inventoryLevel),
          ),
          threshold: numberFormat.format(Number(lowStockThreshold)),
          unit,
        },
        lang,
      });

      groups.set(supplierId, {
        supplierName,
        items: [...(groups.get(supplierId)?.items ?? []), item],
      });
    }

    await this.mailerService.sendMail({
      to: email,
      subject: this.i18n.t('mail.low_stock_digest.subject', translate),
      template: 'digest',
      context: {
        action: this.i18n.t('mail.low_stock_digest.action', options),
        groups: [...groups.values()].map(({ supplierName, items }) => ({
          heading:
            supplierName ??
            this.i18n.t('mail.low_stock_digest.no_supplier', options),
          items,
        })),
        home_url: url,
        i18nLang: lang,
        intro: this.i18n.t('mail.low_stock_digest.intro', translate),
        productName,
        salutation: this.i18n.t('mail.low_stock_digest.salutation', translate),
        title: this.i18n.t('mail.low_stock_digest.title', options),
        trouble_hint: this.i18n.t(
          'mail.low_stock_digest.trouble_hint',
          options,
        ),
        url,
      },
    });
  }

  public async sendDailySalesDigest({
    recipient: { email, lang },
    organizationName,
    currency,
    date,
    path,
    current,
    previous,
    peakHour,
    pointAdjustments,
    refundedOrders,
    topItems,
  }: {
    recipient: { email: string; lang: Language };
    organizationName: string;
    currency: string;
    date: Date;
    path: string;
    current: { orders: number; revenue: number };
    previous: { orders: number; revenue: number };
    peakHour: { hour: number; orders: number };
    pointAdjustments: {
      adjuster: string | null;
      member: string;
      points: number;
      reason: string | null;
    }[];
    refundedOrders: number;
    topItems: { name: string; sold: number }[];
  }): Promise<void> {
    const productName = PRODUCT_NAME;
    const url = `${this.configService.get<string>('NEXT_ADMIN_URL')}/${lang}${path}`;
    const options = { lang };
    const money = new Intl.NumberFormat(lang, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
    const args = {
      average: money.format(
        current.orders ? current.revenue / current.orders : 0,
      ),
      date: new Intl.DateTimeFormat(lang, {
        dateStyle: 'medium',
        timeZone: PLATFORM_TIMEZONE,
      }).format(date),
      orders: current.orders,
      organizationName,
      peakHour: `${String(peakHour.hour).padStart(2, '0')}:00–${String(peakHour.hour + 1).padStart(2, '0')}:00`,
      peakOrders: peakHour.orders,
      previousOrders: previous.orders,
      previousRevenue: money.format(previous.revenue),
      productName,
      refundedOrders,
      revenue: money.format(current.revenue),
    };
    const translate = { args, lang };
    const groups = [
      {
        heading: this.i18n.t('mail.daily_sales_digest.overview', options),
        items: (
          [
            'mail.daily_sales_digest.revenue',
            'mail.daily_sales_digest.orders',
            'mail.daily_sales_digest.average',
            'mail.daily_sales_digest.peak_hour',
            'mail.daily_sales_digest.refunds',
          ] as const
        )
          .filter(
            (key) =>
              current.orders > 0 ||
              (key !== 'mail.daily_sales_digest.average' &&
                key !== 'mail.daily_sales_digest.peak_hour'),
          )
          .map((key) => this.i18n.t(key, translate)),
      },
    ];
    if (topItems.length)
      groups.push({
        heading: this.i18n.t('mail.daily_sales_digest.top_items', options),
        items: topItems.map(({ name, sold }) =>
          this.i18n.t('mail.daily_sales_digest.item', {
            args: { name, sold },
            lang,
          }),
        ),
      });
    if (pointAdjustments.length) {
      const signed = new Intl.NumberFormat(lang, { signDisplay: 'always' });
      groups.push({
        heading: this.i18n.t('mail.daily_sales_digest.point_adjustments', {
          args: {
            count: pointAdjustments.length,
            total: signed.format(
              pointAdjustments.reduce((sum, { points }) => sum + points, 0),
            ),
          },
          lang,
        }),
        items: pointAdjustments.map(({ adjuster, member, points, reason }) =>
          this.i18n.t('mail.daily_sales_digest.point_adjustment', {
            args: {
              adjuster: adjuster ?? '—',
              member,
              points: signed.format(points),
              reason: reason ?? '',
            },
            lang,
          }),
        ),
      });
    }

    await this.mailerService.sendMail({
      to: email,
      subject: this.i18n.t('mail.daily_sales_digest.subject', translate),
      template: 'digest',
      context: {
        action: this.i18n.t('mail.daily_sales_digest.action', options),
        groups,
        home_url: url,
        i18nLang: lang,
        intro: this.i18n.t('mail.daily_sales_digest.intro', translate),
        productName,
        salutation: this.i18n.t(
          'mail.daily_sales_digest.salutation',
          translate,
        ),
        title: this.i18n.t('mail.daily_sales_digest.title', options),
        trouble_hint: this.i18n.t(
          'mail.daily_sales_digest.trouble_hint',
          options,
        ),
        url,
      },
    });
  }

  public async sendPlatformDailyDigest({
    recipient: { email, lang },
    date,
    path,
    stores,
  }: {
    recipient: { email: string; lang: Language };
    date: Date;
    path: string;
    stores: {
      organizationName: string;
      currency: string;
      path: string;
      orders: number;
      revenue: number;
      refundedOrders: number;
      pointAdjustments: { count: number; total: number };
      lowStock: number;
    }[];
  }): Promise<void> {
    const productName = PRODUCT_NAME;
    const adminUrl = `${this.configService.get<string>('NEXT_ADMIN_URL')}/${lang}`;
    const url = `${adminUrl}${path}`;
    const options = { lang };
    const signed = new Intl.NumberFormat(lang, { signDisplay: 'always' });
    const translate = {
      args: {
        count: stores.length,
        date: new Intl.DateTimeFormat(lang, {
          dateStyle: 'medium',
          timeZone: PLATFORM_TIMEZONE,
        }).format(date),
        productName,
      },
      lang,
    };

    await this.mailerService.sendMail({
      to: email,
      subject: this.i18n.t('mail.platform_daily_digest.subject', translate),
      template: 'digest',
      context: {
        action: this.i18n.t('mail.platform_daily_digest.action', options),
        groups: stores.map(
          ({
            organizationName,
            currency,
            path: storePath,
            pointAdjustments,
            ...store
          }) => {
            const args = {
              ...store,
              revenue: new Intl.NumberFormat(lang, {
                style: 'currency',
                currency,
                maximumFractionDigits: 0,
              }).format(store.revenue),
              adjustments: pointAdjustments.count,
              points: signed.format(pointAdjustments.total),
            };
            return {
              heading: organizationName,
              url: `${adminUrl}${storePath}`,
              items: [
                this.i18n.t('mail.platform_daily_digest.revenue', {
                  args,
                  lang,
                }),
                this.i18n.t('mail.platform_daily_digest.orders', {
                  args,
                  lang,
                }),
                this.i18n.t('mail.platform_daily_digest.refunds', {
                  args,
                  lang,
                }),
                ...(pointAdjustments.count
                  ? [
                      this.i18n.t(
                        'mail.platform_daily_digest.point_adjustments',
                        { args, lang },
                      ),
                    ]
                  : []),
                ...(store.lowStock
                  ? [
                      this.i18n.t('mail.platform_daily_digest.low_stock', {
                        args,
                        lang,
                      }),
                    ]
                  : []),
              ],
            };
          },
        ),
        home_url: url,
        i18nLang: lang,
        intro: this.i18n.t('mail.platform_daily_digest.intro', translate),
        productName,
        salutation: this.i18n.t(
          'mail.platform_daily_digest.salutation',
          translate,
        ),
        title: this.i18n.t('mail.platform_daily_digest.title', options),
        trouble_hint: this.i18n.t(
          'mail.platform_daily_digest.trouble_hint',
          options,
        ),
        url,
      },
    });
  }

  public async sendWaitlistNotification({
    email,
    holdUntil,
    kind,
    lang,
    organizationName,
    partySize,
    path,
    ticketNumber,
  }: {
    email: string;
    holdUntil: Date | null;
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
      args: {
        holdUntil:
          holdUntil &&
          new Intl.DateTimeFormat(lang, {
            hour: '2-digit',
            hourCycle: 'h23',
            minute: '2-digit',
            timeZone: PLATFORM_TIMEZONE,
          }).format(holdUntil),
        organizationName,
        partySize,
        productName,
        ticketNumber,
      },
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
