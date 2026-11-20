import { MailerService, type ISendMailOptions } from '@nestjs-modules/mailer';
import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { and, eq, sql } from 'drizzle-orm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import type { NodemailerError } from 'nodemailer';
import type { AttendanceNotificationKind } from '../attendance/attendance-notification.events.js';
import { PRODUCT_NAME } from '../common/constants/product.js';
import { PLATFORM_TIMEZONE } from '../common/constants/timezone.js';
import { isLanguage, pickLanguage } from '../common/utils/language.js';
import { notBanned } from '../common/utils/users.js';
import { type Language } from '../db/schema/enums.js';
import type { UnitCode } from '../db/schema/inventory.js';
import {
  memberRoleEnum,
  organization,
  type MemberRole,
} from '../db/schema/organizations.js';
import { user, type User } from '../db/schema/users.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import { I18nTranslations } from '../generated/i18n.generated.js';
import { UAParser } from 'ua-parser-js';

import { SendTestEmailDto } from './dto/send-test-email.dto.js';

const redact = (text: string) =>
  text
    .replace(/https?:\/\/\S+/g, '[url]')
    .replace(/([^\s<>"'@,;:])[^\s<>"'@,;:]*@/g, '$1***@');

const deviceOf = (request?: Request) => {
  const result = new UAParser(
    request?.headers.get('user-agent') || undefined,
  ).getResult();
  return {
    browser_name: result.browser?.name || 'Unknown',
    operating_system: result.os?.name || 'Unknown',
  };
};

const authPageUrl = (
  homeUrl: string,
  page: string,
  { email, token, url }: { email: string; token: string; url: string },
) => {
  const callbackURL = new URL(url).searchParams.get('callbackURL');
  const params = new URLSearchParams({
    email,
    token,
    ...(callbackURL && { redirectTo: callbackURL }),
  });
  return `${homeUrl}/auth/${page}?${params.toString()}`;
};

const countryName = (code: string, lang: Language) => {
  try {
    return new Intl.DisplayNames(lang, { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

const formatAddress = (
  address: Pick<
    typeof organization.$inferSelect,
    | 'addressCountry'
    | 'addressLocality'
    | 'addressRegion'
    | 'extendedAddress'
    | 'postalCode'
    | 'streetAddress'
  >,
  lang: Language,
) => {
  const groups = [
    [address.streetAddress, address.extendedAddress],
    [address.addressLocality],
    [address.addressRegion],
    [address.postalCode],
    [countryName(address.addressCountry, lang)],
  ];

  return (lang === 'en' ? groups : groups.reverse())
    .flat()
    .filter(Boolean)
    .join(', ');
};

const sendFailure = (template: string, to: string, error: unknown) =>
  redact(
    `Failed to send ${template} email to ${to}: ${error instanceof Error ? error.message : String(error)}`,
  );

const hourRange = (hour: number) =>
  `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`;

type PointAdjustmentLine = {
  adjuster: string | null;
  member: string;
  points: number;
  reason: string | null;
};

type LowStockLine = {
  name: string;
  inventoryLevel: string;
  lowStockThreshold: string;
  unitCode: UnitCode;
};

type AccountMailRecipient = Pick<User, 'email' | 'name'> &
  Partial<Pick<User, 'lang'>>;

const ACCOUNT_MAIL_SUBJECTS = {
  'after-email-verification': 'mail.after_email_verification.subject',
  'on-existing-user-sign-up': 'mail.on_existing_user_sign_up.subject',
  'on-password-reset': 'mail.on_password_reset.subject',
  'send-change-email-confirmation':
    'mail.send_change_email_confirmation.subject',
  'send-delete-account-verification':
    'mail.send_delete_account_verification.subject',
  'send-reset-password': 'mail.send_reset_password.subject',
  'send-verification-email': 'mail.send_verification_email.subject',
} as const;

type AccountMailTemplate = keyof typeof ACCOUNT_MAIL_SUBJECTS;

@Injectable()
export class MailsService {
  private readonly logger = new Logger(MailsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly mailerService: MailerService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  private get supportUrl(): string {
    return `mailto:${this.configService.get<string>('MAIL_USER')}`;
  }

  private languageFor(
    recipientLang: Language | undefined,
    request?: Request,
  ): Language {
    if (isLanguage(recipientLang)) return recipientLang;

    return (
      pickLanguage(request?.headers.get('accept-language')) ??
      this.configService.getOrThrow<Language>('FALLBACK_LANGUAGE')
    );
  }

  private async send(
    options: ISendMailOptions & { to: string; template: string },
  ): Promise<void> {
    await this.mailerService.sendMail(options).catch((error: unknown) => {
      this.logger.error(sendFailure(options.template, options.to, error));
    });
  }

  private async sendOrThrow(
    options: ISendMailOptions & { to: string; template: string },
  ): Promise<void> {
    await this.mailerService.sendMail(options).catch((error: unknown) => {
      throw new Error(sendFailure(options.template, options.to, error));
    });
  }

  private async sendAccountMail(
    template: AccountMailTemplate,
    { email, name, lang: recipientLang }: AccountMailRecipient,
    request: Request | undefined,
    context: (home_url: string) => Record<string, string>,
  ): Promise<void> {
    const productName = PRODUCT_NAME;
    const lang = this.languageFor(recipientLang, request);
    const home_url = `${this.configService.get<string>('NEXT_URL')}/${lang}`;

    await this.send({
      to: email,
      subject: this.i18n.t(ACCOUNT_MAIL_SUBJECTS[template], {
        args: { productName },
        lang,
      }),
      template,
      context: {
        ...deviceOf(request),
        home_url,
        i18nLang: lang,
        name,
        productName,
        support_url: this.supportUrl,
        ...context(home_url),
      },
    });
  }

  public async sendPointsExpiryReminder({
    userId,
    points,
    expiresAt,
  }: {
    userId: string;
    points: number;
    expiresAt: Date;
  }): Promise<boolean> {
    const member = await this.db.query.user.findFirst({
      columns: { email: true, lang: true },
      where: and(eq(user.id, userId), notBanned(new Date())),
    });
    if (!member) return false;

    const productName = PRODUCT_NAME;
    const template = 'points-expiry-reminder';
    const lang = this.languageFor(member.lang);
    const baseUrl = this.configService.get<string>('NEXT_URL');
    const url = `${baseUrl}/${lang}/auth/points/transactions`;
    const options = { lang };
    const translate = {
      args: {
        date: new Intl.DateTimeFormat(lang, {
          dateStyle: 'medium',
          timeZone: PLATFORM_TIMEZONE,
        }).format(expiresAt),
        points: new Intl.NumberFormat(lang).format(points),
        productName,
      },
      lang,
    };

    await this.sendOrThrow({
      to: member.email,
      subject: this.i18n.t('mail.points_expiry_reminder.subject', translate),
      template,
      context: {
        action: this.i18n.t('mail.points_expiry_reminder.action', options),
        home_url: `${baseUrl}/${lang}`,
        i18nLang: lang,
        intro: this.i18n.t('mail.points_expiry_reminder.intro', translate),
        productName,
        salutation: this.i18n.t(
          'mail.points_expiry_reminder.salutation',
          translate,
        ),
        title: this.i18n.t('mail.points_expiry_reminder.title', options),
        trouble_hint: this.i18n.t(
          'mail.points_expiry_reminder.trouble_hint',
          options,
        ),
        url,
      },
    });

    return true;
  }

  public async afterEmailVerification(
    { user }: { user: AccountMailRecipient },
    request?: Request,
  ): Promise<void> {
    await this.sendAccountMail(
      'after-email-verification',
      user,
      request,
      (home_url) => ({ url: home_url }),
    );
  }

  public async onExistingUserSignUp(
    { user }: { user: AccountMailRecipient },
    request?: Request,
  ): Promise<void> {
    await this.sendAccountMail(
      'on-existing-user-sign-up',
      user,
      request,
      (home_url) => ({ sign_in_url: `${home_url}/auth/sign-in` }),
    );
  }

  public async onPasswordReset(
    { user }: { user: AccountMailRecipient },
    request?: Request,
  ): Promise<void> {
    await this.sendAccountMail(
      'on-password-reset',
      user,
      request,
      (home_url) => ({ sign_in_url: `${home_url}/auth/sign-in` }),
    );
  }

  public async sendChangeEmailConfirmation(
    {
      user,
      newEmail,
      url,
      token,
    }: {
      user: AccountMailRecipient;
      newEmail: string;
      url: string;
      token: string;
    },
    request?: Request,
  ): Promise<void> {
    await this.sendAccountMail(
      'send-change-email-confirmation',
      user,
      request,
      (home_url) => ({
        newEmail,
        url: authPageUrl(home_url, 'verify-email', {
          email: user.email,
          token,
          url,
        }),
      }),
    );
  }

  public async sendDeleteAccountVerification(
    {
      user,
      url,
      token,
    }: { user: AccountMailRecipient; url: string; token: string },
    request?: Request,
  ): Promise<void> {
    await this.sendAccountMail(
      'send-delete-account-verification',
      user,
      request,
      (home_url) => ({
        url: authPageUrl(home_url, 'delete-account', {
          email: user.email,
          token,
          url,
        }),
      }),
    );
  }

  public async sendInvitationEmail(
    {
      id,
      email,
      role,
      organization: { id: organizationId, name: organizationName },
      inviter: {
        user: { name: inviterName },
      },
    }: {
      id: string;
      email: string;
      role: string;
      organization: { id: string; name: string };
      inviter: { user: { name: string; email: string } };
    },
    request?: Request,
  ): Promise<void> {
    const productName = PRODUCT_NAME;

    const baseUrl = this.configService.get<string>('NEXT_URL');
    const invitee = await this.db.query.user.findFirst({
      columns: { lang: true },
      where: and(
        sql`lower(${user.email}) = lower(${email})`,
        eq(user.emailVerified, true),
      ),
    });
    const lang = this.languageFor(invitee?.lang, request);
    const home_url = `${baseUrl}/${lang}`;
    const support_url = this.supportUrl;
    const store = await this.db.query.organization.findFirst({
      columns: {
        addressCountry: true,
        addressLocality: true,
        addressRegion: true,
        extendedAddress: true,
        postalCode: true,
        streetAddress: true,
      },
      where: eq(organization.id, organizationId),
    });

    const inviteParams = new URLSearchParams({ email, id });
    const invite_url = `${baseUrl}/${lang}/auth/accept-invitation?${inviteParams.toString()}`;

    await this.send({
      to: email,
      subject: this.i18n.t('mail.organization_invitation.subject', {
        args: { organizationName, productName },
        lang,
      }),
      template: 'organization-invitation',
      context: {
        home_url,
        i18nLang: lang,
        inviterName,
        organizationAddress: store ? formatAddress(store, lang) : '',
        organizationName,
        productName,
        role: (memberRoleEnum.enumValues as readonly string[]).includes(role)
          ? this.i18n.t(
              `mail.organization_invitation.roles.${role as MemberRole}`,
              { lang },
            )
          : role,
        support_url,
        url: invite_url,
      },
    });
  }

  public async sendResetPassword(
    {
      user,
      url,
      token,
    }: { user: AccountMailRecipient; url: string; token: string },
    request?: Request,
  ): Promise<void> {
    await this.sendAccountMail(
      'send-reset-password',
      user,
      request,
      (home_url) => ({
        url: authPageUrl(home_url, 'reset-password', {
          email: user.email,
          token,
          url,
        }),
      }),
    );
  }

  public async sendTestEmail(
    { email }: SendTestEmailDto,
    recipientLang: Language | undefined,
  ): Promise<void> {
    const lang = this.languageFor(recipientLang);
    const text = this.i18n.t('mail.smtp_test.text', { lang });

    await this.mailerService
      .sendMail({
        to: email,
        subject: this.i18n.t('mail.smtp_test.subject', {
          args: { productName: PRODUCT_NAME },
          lang,
        }),
        text,
        html: `<b>${text}</b>`,
      })
      .catch((error: unknown) => {
        const { code, responseCode }: Partial<NodemailerError> =
          error instanceof Error ? error : {};
        throw new BadGatewayException({
          error: 'Bad Gateway',
          message: this.i18n.t('common.exceptions.smtpTestFailed', {
            lang: I18nContext.current()?.lang,
          }),
          smtp: { code, responseCode },
        });
      });
  }

  public async sendVerificationEmail(
    {
      user,
      url,
      token,
    }: { user: AccountMailRecipient; url: string; token: string },
    request?: Request,
  ): Promise<void> {
    await this.sendAccountMail(
      'send-verification-email',
      user,
      request,
      (home_url) => ({
        url: authPageUrl(home_url, 'verify-email', {
          email: user.email,
          token,
          url,
        }),
      }),
    );
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

    await this.send({
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
    });
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

    await this.sendOrThrow({
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

    await this.sendOrThrow({
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
      const item = this.lowStockLine(lang, numberFormat, {
        name,
        inventoryLevel,
        lowStockThreshold,
        unitCode,
      });

      groups.set(supplierId, {
        supplierName,
        items: [...(groups.get(supplierId)?.items ?? []), item],
      });
    }

    await this.sendOrThrow({
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
    pointAdjustments: PointAdjustmentLine[];
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
      peakHour: hourRange(peakHour.hour),
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
        items: pointAdjustments.map((adjustment) =>
          this.pointAdjustmentLine(lang, signed, adjustment),
        ),
      });
    }

    await this.sendOrThrow({
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
      sales: {
        current: { orders: number; revenue: number };
        previous: { orders: number; revenue: number };
        peakHour: { hour: number; orders: number };
        refundedOrders: number;
        topItems: { name: string; sold: number }[];
      } | null;
      pointAdjustments: PointAdjustmentLine[];
      lowStock: (LowStockLine & { supplierName: string | null })[];
    }[];
  }): Promise<void> {
    const productName = PRODUCT_NAME;
    const adminUrl = `${this.configService.get<string>('NEXT_ADMIN_URL')}/${lang}`;
    const url = `${adminUrl}${path}`;
    const options = { lang };
    const signed = new Intl.NumberFormat(lang, { signDisplay: 'always' });
    const quantity = new Intl.NumberFormat(lang, { maximumFractionDigits: 3 });
    const list = new Intl.ListFormat(lang);
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

    await this.sendOrThrow({
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
            sales,
            pointAdjustments,
            lowStock,
          }) => {
            const money = new Intl.NumberFormat(lang, {
              style: 'currency',
              currency,
              maximumFractionDigits: 0,
            });
            const salesArgs = sales && {
              average: money.format(
                sales.current.orders
                  ? sales.current.revenue / sales.current.orders
                  : 0,
              ),
              orders: sales.current.orders,
              peakHour: hourRange(sales.peakHour.hour),
              peakOrders: sales.peakHour.orders,
              previousOrders: sales.previous.orders,
              previousRevenue: money.format(sales.previous.revenue),
              refundedOrders: sales.refundedOrders,
              revenue: money.format(sales.current.revenue),
              topItems: sales.topItems.length
                ? list.format(
                    sales.topItems.map(({ name, sold }) =>
                      this.i18n.t('mail.platform_daily_digest.item', {
                        args: { name, sold },
                        lang,
                      }),
                    ),
                  )
                : null,
            };
            const args = {
              adjustments: pointAdjustments.length,
              lowStock: lowStock.length,
              points: signed.format(
                pointAdjustments.reduce((sum, { points }) => sum + points, 0),
              ),
            };
            return {
              heading: organizationName,
              url: `${adminUrl}${storePath}`,
              items: [
                ...(salesArgs
                  ? [
                      this.i18n.t('mail.daily_sales_digest.revenue', {
                        args: salesArgs,
                        lang,
                      }),
                      this.i18n.t('mail.daily_sales_digest.orders', {
                        args: salesArgs,
                        lang,
                      }),
                      ...(salesArgs.orders
                        ? [
                            this.i18n.t('mail.daily_sales_digest.average', {
                              args: salesArgs,
                              lang,
                            }),
                            this.i18n.t('mail.daily_sales_digest.peak_hour', {
                              args: salesArgs,
                              lang,
                            }),
                          ]
                        : []),
                      this.i18n.t('mail.platform_daily_digest.refunds', {
                        args: salesArgs,
                        lang,
                      }),
                      ...(salesArgs.topItems
                        ? [
                            this.i18n.t(
                              'mail.platform_daily_digest.top_items',
                              { args: { items: salesArgs.topItems }, lang },
                            ),
                          ]
                        : []),
                    ]
                  : [
                      this.i18n.t(
                        'mail.platform_daily_digest.sales_unavailable',
                        options,
                      ),
                    ]),
                ...(pointAdjustments.length
                  ? [
                      this.i18n.t(
                        'mail.platform_daily_digest.point_adjustments',
                        { args, lang },
                      ),
                      ...pointAdjustments.map((adjustment) =>
                        this.pointAdjustmentLine(lang, signed, adjustment),
                      ),
                    ]
                  : []),
                ...(lowStock.length
                  ? [
                      this.i18n.t('mail.platform_daily_digest.low_stock', {
                        args,
                        lang,
                      }),
                      ...lowStock.map(({ supplierName, ...ingredient }) =>
                        this.i18n.t(
                          'mail.platform_daily_digest.low_stock_item',
                          {
                            args: {
                              item: this.lowStockLine(
                                lang,
                                quantity,
                                ingredient,
                              ),
                              supplier:
                                supplierName ??
                                this.i18n.t(
                                  'mail.low_stock_digest.no_supplier',
                                  options,
                                ),
                            },
                            lang,
                          },
                        ),
                      ),
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

  private lowStockLine(
    lang: Language,
    quantity: Intl.NumberFormat,
    { name, inventoryLevel, lowStockThreshold, unitCode }: LowStockLine,
  ): string {
    const unit = this.i18n.t(`mail.low_stock_digest.units.${unitCode}`, {
      lang,
    });
    return this.i18n.t('mail.low_stock_digest.item', {
      args: {
        level: quantity.format(Number(inventoryLevel)),
        name,
        shortage: quantity.format(
          Number(lowStockThreshold) - Number(inventoryLevel),
        ),
        threshold: quantity.format(Number(lowStockThreshold)),
        unit,
      },
      lang,
    });
  }

  private pointAdjustmentLine(
    lang: Language,
    signed: Intl.NumberFormat,
    { adjuster, member, points, reason }: PointAdjustmentLine,
  ): string {
    return this.i18n.t('mail.daily_sales_digest.point_adjustment', {
      args: {
        adjuster: adjuster ?? '—',
        member,
        points: signed.format(points),
        reason: reason ?? '',
      },
      lang,
    });
  }

  public async sendWaitlistNotification({
    email,
    holdUntil,
    kind,
    lang,
    note,
    organizationName,
    partySize,
    path,
    ticketNumber,
  }: {
    email: string;
    holdUntil: Date | null;
    kind: 'joined' | 'called' | 'cancelled';
    lang: Language;
    note?: string | null;
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
        note,
        organizationName,
        partySize,
        productName,
        ticketNumber,
      },
      lang,
    };

    await this.send({
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
        detail:
          kind === 'cancelled' && !note
            ? null
            : this.i18n.t(
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
    });
  }

  public async sendOrderStoreClosed({
    amount,
    email,
    lang: recipientLang,
    note,
    orderNumber,
    organizationName,
    pickupTime,
  }: {
    amount: string;
    email: string;
    lang: Language | null;
    note: string | null;
    orderNumber: string;
    organizationName: string;
    pickupTime: Date;
  }): Promise<void> {
    const productName = PRODUCT_NAME;
    const template = 'order-store-closed';
    const lang = this.languageFor(recipientLang ?? undefined);
    const url = `${this.configService.get<string>('NEXT_URL')}/${lang}`;
    const options = { lang };
    const translate = {
      args: {
        amount: new Intl.NumberFormat(lang, {
          currency: 'TWD',
          maximumFractionDigits: 0,
          style: 'currency',
        }).format(Number(amount)),
        note,
        orderNumber,
        organizationName,
        pickupTime: new Intl.DateTimeFormat(lang, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: PLATFORM_TIMEZONE,
        }).format(pickupTime),
        productName,
      },
      lang,
    };

    await this.send({
      to: email,
      subject: this.i18n.t('mail.order_store_closed.subject', translate),
      template,
      context: {
        action: this.i18n.t('mail.order_store_closed.action', options),
        detail: note && this.i18n.t('mail.order_store_closed.note', translate),
        home_url: url,
        i18nLang: lang,
        intro: this.i18n.t('mail.order_store_closed.intro', translate),
        productName,
        refund_hint: this.i18n.t(
          'mail.order_store_closed.refund_hint',
          options,
        ),
        salutation: this.i18n.t(
          'mail.order_store_closed.salutation',
          translate,
        ),
        title: this.i18n.t('mail.order_store_closed.title', options),
        trouble_hint: this.i18n.t(
          'mail.order_store_closed.trouble_hint',
          options,
        ),
        url,
      },
    });
  }
}
