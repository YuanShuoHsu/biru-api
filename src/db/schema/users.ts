// https://www.better-auth.com/docs/concepts/cli
// https://www.better-auth.com/docs/concepts/database
// https://orm.drizzle.team/docs/sql-schema-declaration

import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';

export const gendersEnum = pgEnum('genders', ['female', 'male', 'other']);
export type GenderEnum = (typeof gendersEnum.enumValues)[number];

export const langsEnum = pgEnum('langs', ['en', 'ja', 'ko', 'zh-CN', 'zh-TW']);
export type LangEnum = (typeof langsEnum.enumValues)[number];

export const rolesEnum = pgEnum('roles', ['admin', 'manager', 'staff', 'user']);
export type RoleEnum = (typeof rolesEnum.enumValues)[number];

export const DEFAULT_GENDER: GenderEnum = 'other';
export const DEFAULT_LANG: LangEnum = 'zh-TW';
export const DEFAULT_ROLE: RoleEnum = 'user';

export const user = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  ...timestamps,
  // additional fields
  birthDate: timestamp('birth_date').notNull(),
  emailSubscribed: boolean('email_subscribed').default(true).notNull(),
  firstName: text('first_name').notNull(),
  gender: gendersEnum().default(DEFAULT_GENDER).notNull(),
  lang: langsEnum().default(DEFAULT_LANG).notNull(),
  lastName: text('last_name'),
  phoneNumber: text('phone_number').notNull().unique(),
  phoneVerified: boolean('phone_verified').default(false).notNull(),
  role: rolesEnum().default(DEFAULT_ROLE).notNull(),
});

export const session = pgTable(
  'session',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').unique().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    ...timestamps,
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    ...timestamps,
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  sessions: many(session),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));
