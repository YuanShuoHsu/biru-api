import { pgEnum } from 'drizzle-orm/pg-core';

export const providerEnum = pgEnum('Provider', ['LOCAL', 'GOOGLE']);
export const genderEnum = pgEnum('Gender', ['FEMALE', 'MALE', 'OTHER']);
export const roleEnum = pgEnum('Role', ['ADMIN', 'MANAGER', 'STAFF', 'USER']);
