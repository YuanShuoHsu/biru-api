import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { languagesEnum } from './enums.js';
import { order } from './orders.js';
import { user } from './users.js';
import { waitlistTicket } from './waitlist.js';

export const pushSubscriptionAppEnum = pgEnum('push_subscription_app', [
  'storefront',
  'admin',
]);
export type PushSubscriptionApp =
  (typeof pushSubscriptionAppEnum.enumValues)[number];

export const pushSubscription = pgTable(
  'push_subscription',
  {
    id: text('id').primaryKey(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    lang: languagesEnum('lang').notNull(),
    app: pushSubscriptionAppEnum('app').notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    orderId: text('order_id').references(() => order.id, {
      onDelete: 'cascade',
    }),
    waitlistTicketId: text('waitlist_ticket_id').references(
      () => waitlistTicket.id,
      { onDelete: 'cascade' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('push_subscription_endpoint_unique').on(table.endpoint),
    index('push_subscription_userId_idx').on(table.userId),
    index('push_subscription_orderId_idx').on(table.orderId),
    index('push_subscription_waitlistTicketId_idx').on(table.waitlistTicketId),
  ],
);

export type PushSubscription = typeof pushSubscription.$inferSelect;
