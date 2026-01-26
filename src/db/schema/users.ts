// https://www.better-auth.com/docs/concepts/cli

import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { Gender, Role } from 'src/common/enums';

import { timestamps } from './columns.helpers';
import { posts } from './posts';

export const genderEnum = pgEnum('Gender', ['FEMALE', 'MALE', 'OTHER']);
export const roleEnum = pgEnum('Role', ['ADMIN', 'MANAGER', 'STAFF', 'USER']);

export const user = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  ...timestamps,
  // Custom fields
  birthDate: timestamp('birth_date'),
  countryCode: text('country_code').default('TW').notNull(),
  countryLabel: text('country_label').default('Taiwan').notNull(),
  countryPhone: text('country_phone').default('+886').notNull(),
  firstName: text('first_name').default('').notNull(),
  gender: genderEnum('gender').default('OTHER').notNull().$type<Gender>(),
  isSubscribed: boolean('is_subscribed').default(true).notNull(),
  lastName: text('last_name').default('').notNull(),
  phoneNumber: text('phone_number'),
  phoneVerified: boolean('phone_verified').default(false).notNull(),
  role: roleEnum('role').default('USER').notNull().$type<Role>(),
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
  posts: many(posts),
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
