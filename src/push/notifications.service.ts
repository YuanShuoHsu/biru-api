// https://github.com/web-push-libs/web-push/blob/v3.6.7/README.md
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { and, eq } from 'drizzle-orm';
import { I18nService } from 'nestjs-i18n';
import webpush, { type RequestOptions } from 'web-push';

import { pushSubscription, type PushSubscription } from '../db/schema/push.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';
import type {
  I18nPath,
  I18nTranslations,
} from '../generated/i18n.generated.js';

import { pinnedAgent, resolvePublicAddresses } from './public-address.js';

const PUSH_TIMEOUT_MS = 10_000;

export type PushRecipient = { waitlistTicketId: string };

export type PushMessage = {
  title: I18nPath;
  body: I18nPath;
  args: Record<string, string>;
  path: string;
  ttlSeconds: number;
};

type VapidDetails = NonNullable<RequestOptions['vapidDetails']>;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly vapidDetails: VapidDetails | null;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
    configService: ConfigService,
  ) {
    const publicKey = configService.get<string>('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
    const privateKey = configService.get<string>('VAPID_PRIVATE_KEY');
    const subject = configService.get<string>('VAPID_SUBJECT');
    this.vapidDetails =
      publicKey && privateKey && subject
        ? { publicKey, privateKey, subject }
        : null;
  }

  async notify(
    recipient: PushRecipient,
    {
      push,
      email,
    }: { push: PushMessage | null; email: (() => Promise<void>) | null },
  ): Promise<void> {
    if (this.vapidDetails) {
      const subscriptions = await this.db
        .select()
        .from(pushSubscription)
        .where(
          and(
            eq(pushSubscription.app, 'storefront'),
            eq(pushSubscription.waitlistTicketId, recipient.waitlistTicketId),
          ),
        );
      if (
        subscriptions.length &&
        (!push || (await this.pushAll(subscriptions, push, this.vapidDetails)))
      )
        return;
    }
    await email?.();
  }

  private async pushAll(
    subscriptions: PushSubscription[],
    message: PushMessage,
    vapidDetails: VapidDetails,
  ): Promise<boolean> {
    const delivered = await Promise.all(
      subscriptions.map((subscription) =>
        this.pushTo(subscription, message, vapidDetails),
      ),
    );
    return delivered.includes(true);
  }

  private async pushTo(
    { id, endpoint, p256dh, auth, lang }: PushSubscription,
    { title, body, args, path, ttlSeconds }: PushMessage,
    vapidDetails: VapidDetails,
  ): Promise<boolean> {
    const { hostname, protocol } = new URL(endpoint);
    const addresses =
      protocol === 'https:'
        ? await resolvePublicAddresses(hostname).catch(() => null)
        : null;
    if (!addresses) {
      this.logger.warn(`Push host ${hostname} has no public address`);
      return false;
    }

    const agent = pinnedAgent(addresses);
    try {
      // https://www.rfc-editor.org/rfc/rfc8030#section-5.2
      await webpush.sendNotification(
        { endpoint, keys: { p256dh, auth } },
        JSON.stringify({
          title: this.i18n.t(title, { lang, args }),
          body: this.i18n.t(body, { lang, args }),
          path: `/${lang}${path}`,
        }),
        {
          agent,
          timeout: PUSH_TIMEOUT_MS,
          TTL: ttlSeconds,
          urgency: 'high',
          vapidDetails,
        },
      );
      return true;
    } catch (error) {
      const statusCode =
        error instanceof webpush.WebPushError ? error.statusCode : null;
      if (statusCode === 404 || statusCode === 410)
        await this.db
          .delete(pushSubscription)
          .where(eq(pushSubscription.id, id));
      else
        this.logger.warn(
          `Push to ${hostname} failed: ${statusCode ?? (error as Error).message}`,
        );
      return false;
    } finally {
      agent.destroy();
    }
  }
}
