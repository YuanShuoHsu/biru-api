import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';

import {
  servingTemperatureLevelEnum,
  sweetnessLevelEnum,
  type ServingTemperatureLevel,
  type SweetnessLevel,
} from './enums.js';
import { orderModeEnum } from './orders.js';
import { organization } from './organizations.js';
import { session, user } from './users.js';

export const SHARED_CART_ANIMAL_AVATARS = [
  'cat',
  'dog',
  'rabbit',
  'bear',
  'fox',
  'panda',
  'penguin',
  'koala',
] as const;
export type SharedCartAnimalAvatar =
  (typeof SHARED_CART_ANIMAL_AVATARS)[number];

export const sharedCartAvatarEnum = pgEnum('shared_cart_avatar', [
  ...SHARED_CART_ANIMAL_AVATARS,
  'member',
]);
export type SharedCartAvatar = (typeof sharedCartAvatarEnum.enumValues)[number];

export const sharedCartParticipantStatusEnum = pgEnum(
  'shared_cart_participant_status',
  ['pending', 'active'],
);
export type SharedCartParticipantStatus =
  (typeof sharedCartParticipantStatusEnum.enumValues)[number];

export const sharedCart = pgTable(
  'shared_cart',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    mode: orderModeEnum('mode').notNull(),
    tableNumber: integer('table_number'),
    checkoutParticipantId: text('checkout_participant_id'),
    checkoutLockedAt: timestamp('checkout_locked_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('shared_cart_organizationId_code_unique').on(
      table.organizationId,
      table.code,
    ),
    foreignKey({
      name: 'shared_cart_checkoutParticipantId_fk',
      columns: [table.checkoutParticipantId],
      foreignColumns: [sharedCartParticipant.id],
    }).onDelete('set null'),
  ],
);

export type SharedCart = typeof sharedCart.$inferSelect;

export const sharedCartParticipant = pgTable(
  'shared_cart_participant',
  {
    id: text('id').primaryKey(),
    sharedCartId: text('shared_cart_id')
      .notNull()
      .references(() => sharedCart.id, { onDelete: 'cascade' }),
    deviceKey: text('device_key').notNull(),
    userId: text('user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    sessionId: text('session_id').references(() => session.id, {
      onDelete: 'set null',
    }),
    avatar: sharedCartAvatarEnum('avatar').notNull(),
    nickname: text('nickname').notNull(),
    memberProfile: boolean('member_profile').notNull(),
    status: sharedCartParticipantStatusEnum('status').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('shared_cart_participant_sharedCartId_idx').on(table.sharedCartId),
    uniqueIndex('shared_cart_participant_sharedCartId_deviceKey_unique').on(
      table.sharedCartId,
      table.deviceKey,
    ),
    index('shared_cart_participant_deviceKey_idx').on(table.deviceKey),
    index('shared_cart_participant_userId_idx').on(table.userId),
    index('shared_cart_participant_sessionId_idx').on(table.sessionId),
    uniqueIndex('shared_cart_participant_deviceKey_active_unique')
      .on(table.deviceKey)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex('shared_cart_participant_deviceKey_pending_unique')
      .on(table.deviceKey)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export type SharedCartParticipant = typeof sharedCartParticipant.$inferSelect;

export interface SharedCartItemAddOn {
  menuItemId: string;
  modifiers: Record<string, string[]>;
  servingTemperatureLevel?: ServingTemperatureLevel | null;
  sweetnessLevel?: SweetnessLevel | null;
}

export const sharedCartItem = pgTable(
  'shared_cart_item',
  {
    id: text('id').primaryKey(),
    sharedCartId: text('shared_cart_id')
      .notNull()
      .references(() => sharedCart.id, { onDelete: 'cascade' }),
    participantId: text('participant_id')
      .notNull()
      .references(() => sharedCartParticipant.id, { onDelete: 'cascade' }),
    menuItemId: text('menu_item_id').notNull(),
    quantity: integer('quantity').notNull(),
    modifiers: jsonb('modifiers').$type<Record<string, string[]>>().notNull(),
    addOns: jsonb('add_ons').$type<SharedCartItemAddOn[]>().notNull(),
    servingTemperatureLevel: servingTemperatureLevelEnum(
      'serving_temperature_level',
    ),
    sweetnessLevel: sweetnessLevelEnum('sweetness_level'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('shared_cart_item_sharedCartId_idx').on(table.sharedCartId),
  ],
);

export type SharedCartItem = typeof sharedCartItem.$inferSelect;
