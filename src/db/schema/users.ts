import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { Gender, Role } from 'src/common/enums';

import { genderEnum, roleEnum } from './enums';

export const user = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  emailVerified: boolean('emailVerified').notNull(),
  image: text('image'),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
  // Custom fields
  birthDate: timestamp('birthDate', { mode: 'date' }),
  countryCode: text('countryCode').default('TW').notNull(),
  countryLabel: text('countryLabel').default('Taiwan').notNull(),
  countryPhone: text('countryPhone').default('+886').notNull(),
  firstName: text('firstName').default('').notNull(),
  gender: genderEnum('gender').default('OTHER').notNull().$type<Gender>(),
  isSubscribed: boolean('isSubscribed').default(true).notNull(),
  lastName: text('lastName').default('').notNull(),
  phoneNumber: text('phoneNumber'),
  phoneVerified: boolean('phoneVerified').default(false).notNull(),
  role: roleEnum('role').default('USER').notNull().$type<Role>(),
});

export const session = pgTable('session', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').unique().notNull(),
  expiresAt: timestamp('expiresAt', { mode: 'date' }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
});

export const account = pgTable('account', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { mode: 'date' }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { mode: 'date' }),
  scope: text('scope'),
  idToken: text('idToken'),
  password: text('password'),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
});

export const verification = pgTable('verification', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { mode: 'date' }).notNull(),
  createdAt: timestamp('createdAt', { mode: 'date' }),
  updatedAt: timestamp('updatedAt', { mode: 'date' }),
});
